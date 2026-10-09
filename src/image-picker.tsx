import {
    Action,
    ActionPanel,
    Icon,
    Grid,
    showToast,
    Toast,
    getPreferenceValues,
    Clipboard,
    LocalStorage,
    showInFinder,
    Keyboard,
} from "@raycast/api"
import { useEffect, useMemo, useState } from "react"
import * as fs from "node:fs"
import * as path from "node:path"

interface ImageInfo {
    name: string
    path: string
    extension: string
    directory: string
    directoryName: string
    modifiedTime: number
    size: number
}

interface CacheEntry {
    images: ImageInfo[]
    lastModified: number
    directoryPath: string
}

interface DirectoriesCache {
    [key: string]: CacheEntry
}

const directoriesCache: DirectoriesCache = {}
const supportedExtensions = [".png", ".jpg", ".jpeg", ".svg", ".webp", ".gif", ".bmp", ".ico", ".avif"]
const supportedFormatsLabel = "PNG, JPG, JPEG, SVG, WebP, GIF, BMP, ICO, or AVIF"
const allDirectoriesView = "all"
const favoritesView = "favorites"
const recentView = "recent"
const favoritesStorageKey = "favorite-image-paths"
const recentStorageKey = "recent-image-paths"
const recentImagesLimit = 50

function getDirectoryLastModified(directory: string, recursive: boolean): number {
    try {
        const stats = fs.statSync(directory)
        let lastModified = stats.mtime.getTime()

        if (recursive) {
            for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
                if (entry.isDirectory()) {
                    lastModified += getDirectoryLastModified(path.join(directory, entry.name), true)
                }
            }
        }

        return lastModified
    } catch {
        return 0
    }
}

function parseDirectories(preferences: Preferences.ImagePicker): string[] {
    const directories = [
        preferences.directory1,
        preferences.directory2,
        preferences.directory3,
        preferences.directory4,
        preferences.directory5,
    ]

    return directories.filter(dir => dir && dir.trim().length > 0).map(dir => dir!.trim())
}

function getDirectoryDisplayName(directory: string): string {
    return path.basename(directory) || directory
}

function collectImagePaths(directory: string, recursive: boolean): string[] {
    const imagePaths: string[] = []

    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const entryPath = path.join(directory, entry.name)

        if (entry.isDirectory() && recursive) {
            try {
                imagePaths.push(...collectImagePaths(entryPath, true))
            } catch {
                // Skip nested folders that cannot be read while keeping the rest of the configured directory usable.
            }
        } else if (entry.isFile() && supportedExtensions.includes(path.extname(entry.name).toLowerCase())) {
            imagePaths.push(entryPath)
        }
    }

    return imagePaths
}

function sortImages(images: ImageInfo[], sortOrder: Preferences.ImagePicker["sortOrder"]): ImageInfo[] {
    return [...images].sort((first, second) => {
        switch (sortOrder) {
            case "nameDesc":
                return second.name.localeCompare(first.name)
            case "modifiedDesc":
                return second.modifiedTime - first.modifiedTime
            case "sizeDesc":
                return second.size - first.size
            case "nameAsc":
            default:
                return first.name.localeCompare(second.name)
        }
    })
}

function parseStoredPaths(value: string | undefined): string[] {
    if (!value) return []

    try {
        const storedValue: unknown = JSON.parse(value)
        return Array.isArray(storedValue) ? storedValue.filter(item => typeof item === "string") : []
    } catch {
        return []
    }
}

async function fetchImagesFromDirectory(
    directory: string,
    recursive: boolean,
    forceRefresh: boolean = false,
    cacheEnabled: boolean = true,
): Promise<{ images: ImageInfo[]; fromCache: boolean }> {
    try {
        if (!fs.existsSync(directory)) {
            throw new Error(`Directory does not exist: ${directory}`)
        }

        const currentModified = getDirectoryLastModified(directory, recursive)
        const cacheKey = `${directory}:${recursive ? "recursive" : "root"}`

        // Check if we have valid cache for this directory (unless forced refresh or cache disabled)
        if (
            cacheEnabled &&
            !forceRefresh &&
            directoriesCache[cacheKey] &&
            directoriesCache[cacheKey].lastModified === currentModified
        ) {
            return { images: directoriesCache[cacheKey].images, fromCache: true }
        }

        const files = collectImagePaths(directory, recursive)
        const rootDirectoryName = getDirectoryDisplayName(directory)

        const images: ImageInfo[] = files.map(filePath => {
            const stats = fs.statSync(filePath)
            const relativeDirectory = path.relative(directory, path.dirname(filePath))

            return {
                name: path.basename(filePath, path.extname(filePath)),
                path: filePath,
                extension: path.extname(filePath).toLowerCase(),
                directory,
                directoryName: relativeDirectory ? path.join(rootDirectoryName, relativeDirectory) : rootDirectoryName,
                modifiedTime: stats.mtimeMs,
                size: stats.size,
            }
        })

        // Update cache only if cache is enabled
        if (cacheEnabled) {
            directoriesCache[cacheKey] = {
                images,
                lastModified: currentModified,
                directoryPath: directory,
            }
        }

        return { images, fromCache: false }
    } catch (error) {
        throw new Error(`Failed to read directory: ${error instanceof Error ? error.message : "Unknown error"}`)
    }
}

async function fetchImagesFromMultipleDirectories(
    directories: string[],
    recursive: boolean,
    forceRefresh: boolean = false,
    cacheEnabled: boolean = true,
): Promise<{ images: ImageInfo[]; fromCache: boolean }> {
    const results = await Promise.allSettled(
        directories.map(dir => fetchImagesFromDirectory(dir, recursive, forceRefresh, cacheEnabled)),
    )

    let allImages: ImageInfo[] = []
    let anyFromCache = false
    let anyFresh = false

    results.forEach(result => {
        if (result.status === "fulfilled") {
            allImages = allImages.concat(result.value.images)
            if (result.value.fromCache) anyFromCache = true
            else anyFresh = true
        }
    })

    const uniqueImages = [...new Map(allImages.map(image => [image.path, image])).values()]

    return {
        images: uniqueImages,
        fromCache: anyFromCache && !anyFresh,
    }
}

async function copyImageToClipboard(imagePath: string): Promise<void> {
    try {
        if (!fs.existsSync(imagePath)) {
            throw new Error(`Image file does not exist: ${imagePath}`)
        }

        await Clipboard.copy({ file: imagePath })
    } catch (error) {
        throw new Error(`Failed to copy image: ${error instanceof Error ? error.message : "Unknown error"}`)
    }
}

export default function Command() {
    const preferences = getPreferenceValues<Preferences.ImagePicker>()
    const [images, setImages] = useState<ImageInfo[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [favorites, setFavorites] = useState<string[]>([])
    const [recentImages, setRecentImages] = useState<string[]>([])
    const [collectionsLoaded, setCollectionsLoaded] = useState(false)
    const getInitialDirectory = (): string => {
        const defaultDirPref = preferences.defaultDirectory || allDirectoriesView
        if ([allDirectoriesView, favoritesView, recentView].includes(defaultDirPref)) return defaultDirPref

        // Map the preference key to actual directory path for the dropdown
        const dirValue = preferences[defaultDirPref as keyof Preferences.ImagePicker] as string
        if (dirValue && dirValue.trim()) {
            return dirValue.trim() // Return the actual directory path
        }

        return allDirectoriesView // Fallback to all directories
    }

    const [selectedDirectory, setSelectedDirectory] = useState<string>(getInitialDirectory())

    const directories = parseDirectories(preferences)
    const directoryOptions = [
        { title: "All Directories", value: allDirectoriesView },
        { title: "Favorites", value: favoritesView },
        { title: "Recently Used", value: recentView },
        ...directories.map(dir => ({
            title: getDirectoryDisplayName(dir),
            value: dir,
        })),
    ]

    useEffect(() => {
        let cancelled = false

        async function loadCollections() {
            const [storedFavorites, storedRecentImages] = await Promise.all([
                LocalStorage.getItem<string>(favoritesStorageKey),
                LocalStorage.getItem<string>(recentStorageKey),
            ])

            if (!cancelled) {
                setFavorites(parseStoredPaths(storedFavorites))
                setRecentImages(parseStoredPaths(storedRecentImages))
                setCollectionsLoaded(true)
            }
        }

        loadCollections().catch(() => setCollectionsLoaded(true))

        return () => {
            cancelled = true
        }
    }, [])

    const loadImages = async (forceRefresh: boolean = false) => {
        const toast = await showToast({
            style: Toast.Style.Animated,
            title: forceRefresh ? "Refreshing images..." : "Loading images...",
        })

        try {
            setIsLoading(true)
            let result

            if ([allDirectoriesView, favoritesView, recentView].includes(selectedDirectory)) {
                result = await fetchImagesFromMultipleDirectories(
                    directories,
                    preferences.scanSubdirectories,
                    forceRefresh,
                    preferences.enableCache,
                )
            } else {
                result = await fetchImagesFromDirectory(
                    selectedDirectory,
                    preferences.scanSubdirectories,
                    forceRefresh,
                    preferences.enableCache,
                )
            }

            setImages(result.images)

            const visibleImageCount =
                selectedDirectory === favoritesView
                    ? result.images.filter(image => favorites.includes(image.path)).length
                    : selectedDirectory === recentView
                      ? recentImages.filter(imagePath => result.images.some(image => image.path === imagePath)).length
                      : result.images.length

            toast.style = Toast.Style.Success
            const dirInfo =
                selectedDirectory === favoritesView
                    ? "favorites"
                    : selectedDirectory === recentView
                      ? "recent images"
                      : selectedDirectory === allDirectoriesView
                        ? "all directories"
                        : getDirectoryDisplayName(selectedDirectory)

            if (forceRefresh) {
                toast.title = "Images Refreshed"
                toast.message = `Found ${visibleImageCount} images from ${dirInfo} (forced refresh).`
            } else if (result.fromCache && preferences.enableCache) {
                toast.title = "Images Loaded from Cache"
                toast.message = `Found ${visibleImageCount} images from ${dirInfo} (cached).`
            } else {
                toast.title = "Images Loaded from Directory"
                const cacheStatus = preferences.enableCache ? "(scanned)" : "(cache disabled)"
                toast.message = `Found ${visibleImageCount} images from ${dirInfo} ${cacheStatus}.`
            }
        } catch (error) {
            toast.style = Toast.Style.Failure
            toast.title = "Error Loading Images"
            toast.message = error instanceof Error ? error.message : "An unknown error occurred"
            setImages([])
        } finally {
            setIsLoading(false)
        }
    }

    useEffect(() => {
        if (collectionsLoaded) loadImages()
    }, [selectedDirectory, collectionsLoaded])

    const visibleImages = useMemo(() => {
        if (selectedDirectory === favoritesView) {
            const favoritePaths = new Set(favorites)
            return sortImages(
                images.filter(image => favoritePaths.has(image.path)),
                preferences.sortOrder,
            )
        }

        if (selectedDirectory === recentView) {
            const imagesByPath = new Map(images.map(image => [image.path, image]))
            return recentImages.map(imagePath => imagesByPath.get(imagePath)).filter(image => image !== undefined)
        }

        return sortImages(images, preferences.sortOrder)
    }, [favorites, images, preferences.sortOrder, recentImages, selectedDirectory])

    const recordRecentImage = (imagePath: string) => {
        setRecentImages(previousImages => {
            const nextImages = [imagePath, ...previousImages.filter(previousPath => previousPath !== imagePath)].slice(
                0,
                recentImagesLimit,
            )
            void LocalStorage.setItem(recentStorageKey, JSON.stringify(nextImages))
            return nextImages
        })
    }

    const handleToggleFavorite = async (image: ImageInfo) => {
        const isFavorite = favorites.includes(image.path)
        const nextFavorites = isFavorite
            ? favorites.filter(favoritePath => favoritePath !== image.path)
            : [image.path, ...favorites]

        try {
            await LocalStorage.setItem(favoritesStorageKey, JSON.stringify(nextFavorites))
            setFavorites(nextFavorites)
            await showToast({
                style: Toast.Style.Success,
                title: isFavorite ? "Removed from Favorites" : "Added to Favorites",
                message: `${image.name}${image.extension}`,
            })
        } catch {
            await showToast({
                style: Toast.Style.Failure,
                title: "Could Not Update Favorites",
                message: `${image.name}${image.extension}`,
            })
        }
    }

    const handleCopyImage = async (image: ImageInfo) => {
        try {
            await copyImageToClipboard(image.path)
            recordRecentImage(image.path)
            await showToast({
                style: Toast.Style.Success,
                title: "Image Copied",
                message: `${image.name}${image.extension} copied to clipboard`,
            })
        } catch {
            await showToast({
                style: Toast.Style.Failure,
                title: "Error Copying Image",
                message: `Failed to copy ${image.name}${image.extension}`,
            })
        }
    }

    const handlePasteToFocusedApp = async (image: ImageInfo) => {
        try {
            await copyImageToClipboard(image.path)
            await Clipboard.paste({ file: image.path })
            recordRecentImage(image.path)
            await showToast({
                style: Toast.Style.Success,
                title: "Image Pasted",
                message: `${image.name}${image.extension} pasted to focused app`,
            })
        } catch {
            await showToast({
                style: Toast.Style.Failure,
                title: "Error Pasting Image",
                message: `Failed to paste ${image.name}${image.extension}`,
            })
        }
    }

    const handleShowInFileExplorer = async (image: ImageInfo) => {
        try {
            await showInFinder(image.path)
            await showToast({
                style: Toast.Style.Success,
                title: "File Revealed",
                message: `Revealed ${image.name}${image.extension} in File Explorer`,
            })
        } catch {
            await showToast({
                style: Toast.Style.Failure,
                title: "Error Opening File Explorer",
                message: `Failed to reveal ${image.name}${image.extension}`,
            })
        }
    }

    return (
        <Grid
            isLoading={isLoading}
            searchBarPlaceholder="Filter images..."
            searchBarAccessory={
                <Grid.Dropdown tooltip="Select Directory" onChange={setSelectedDirectory} value={selectedDirectory}>
                    {directoryOptions.map(option => (
                        <Grid.Dropdown.Item key={option.value} title={option.title} value={option.value} />
                    ))}
                </Grid.Dropdown>
            }
            columns={5}
            fit={Grid.Fit.Contain}
            inset={Grid.Inset.Medium}
        >
            {visibleImages.length > 0 ? (
                visibleImages.map(image => {
                    const isFavorite = favorites.includes(image.path)

                    return (
                        <Grid.Item
                            key={image.path}
                            title={image.name}
                            subtitle={`${image.extension.toUpperCase()} • ${image.directoryName}`}
                            keywords={[image.extension.slice(1), image.directoryName]}
                            accessory={isFavorite ? { icon: Icon.Star, tooltip: "Favorite" } : undefined}
                            quickLook={{
                                path: image.path,
                                name: `${image.name}${image.extension}`,
                            }}
                            content={{
                                // Convert Windows path to file:// URL (required for Raycast Windows v0.44+)
                                source: `file:///${image.path.replace(/\\/g, "/")}`,
                            }}
                            actions={
                                <ActionPanel>
                                    <ActionPanel.Section>
                                        <Action
                                            title="Paste to Focused App"
                                            icon={Icon.Download}
                                            onAction={() => handlePasteToFocusedApp(image)}
                                        />
                                        <Action.ToggleQuickLook shortcut={Keyboard.Shortcut.Common.ToggleQuickLook} />
                                        <Action
                                            title="Copy to Clipboard"
                                            icon={Icon.Clipboard}
                                            onAction={() => handleCopyImage(image)}
                                            shortcut={Keyboard.Shortcut.Common.Copy}
                                        />
                                    </ActionPanel.Section>

                                    <ActionPanel.Section>
                                        <Action
                                            title={isFavorite ? "Remove from Favorites" : "Add to Favorites"}
                                            icon={isFavorite ? Icon.StarDisabled : Icon.Star}
                                            onAction={() => handleToggleFavorite(image)}
                                            shortcut={Keyboard.Shortcut.Common.Pin}
                                        />
                                    </ActionPanel.Section>

                                    <ActionPanel.Section>
                                        <Action.OpenWith
                                            path={image.path}
                                            shortcut={Keyboard.Shortcut.Common.OpenWith}
                                            onOpen={() => recordRecentImage(image.path)}
                                        />
                                        <Action
                                            title="Show in File Explorer"
                                            icon={Icon.Folder}
                                            onAction={() => handleShowInFileExplorer(image)}
                                            shortcut={Keyboard.Shortcut.Common.Open}
                                        />
                                    </ActionPanel.Section>

                                    <ActionPanel.Section>
                                        <Action
                                            title="Refresh List"
                                            icon={Icon.ArrowClockwise}
                                            onAction={() => loadImages(true)}
                                            shortcut={Keyboard.Shortcut.Common.Refresh}
                                        />
                                    </ActionPanel.Section>
                                </ActionPanel>
                            }
                        />
                    )
                })
            ) : (
                <Grid.EmptyView
                    title={isLoading ? "Loading Images..." : "No Images Found"}
                    description={
                        isLoading
                            ? "Please wait..."
                            : selectedDirectory === favoritesView
                              ? "No favorite images yet"
                              : selectedDirectory === recentView
                                ? "No recently used images yet"
                                : selectedDirectory === allDirectoriesView
                                  ? `No ${supportedFormatsLabel} images found in any configured directory`
                                  : `No ${supportedFormatsLabel} images found in: ${getDirectoryDisplayName(selectedDirectory)}`
                    }
                    icon={Icon.Image}
                />
            )}
        </Grid>
    )
}
