# Image Picker for Raycast

Browse, preview, copy, and paste images from local directories in a grid.

## Features

- Configure up to five image directories and choose a default directory.
- Optionally scan nested folders recursively.
- Browse all directories together or switch between them.
- Preview PNG, JPG, JPEG, SVG, WebP, GIF, BMP, ICO, and AVIF files.
- Open a full-size Quick Look preview from the action panel.
- Save favorites and revisit recently copied, pasted, or opened images.
- Sort images by name, modification date, or file size.
- Search images by filename.
- Press `Enter` to paste an image into the focused application.
- Press `Ctrl+C` to copy, `Ctrl+O` to reveal the file, or `Ctrl+R` to refresh.
- Open an image with any compatible application.
- Optionally cache directory scans for faster loading.
- Run on Raycast 2 for Windows with `@raycast/api` 2.x.

## Installation

1. Install Node.js 22.22.2 or newer.
2. Clone this repository.
3. Run `npm ci`.
4. Run `npm run dev` to import the extension into Raycast.

## Usage

1. Configure at least **Directory 1** in the extension preferences.
2. Optionally configure directories 2–5, the default directory, and image caching.
3. Launch **Browse Images**.
4. Select an image and press `Enter`, or open the action panel for more options.

## Changelog

### 2.2.0

- Added optional recursive scanning of subdirectories.
- Added persistent Favorites and Recently Used views.
- Added configurable sorting by name, modification date, or file size.
- Added WebP, GIF, BMP, ICO, and AVIF support.
- Added an Open With action for choosing another application.

### 2.1.0

- Added full-size image previews with Raycast Quick Look.

### 2.0.0

- Renamed the extension from Logo Picker to Image Picker.
- Renamed the command from Search Logos to Browse Images.
- Added JPG and JPEG support.
- Updated the extension and development tooling to Raycast API 2.

### 1.4.6

- Updated the extension icon path and metadata.

### 1.4.5

- Fixed local thumbnail URLs on Raycast for Windows.
