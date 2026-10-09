/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {
  /** Directory 1 - First directory containing supported images */
  "directory1": string,
  /** Directory 2 (Optional) - Second directory path containing images to browse */
  "directory2"?: string,
  /** Directory 3 (Optional) - Third directory path containing images to browse */
  "directory3"?: string,
  /** Directory 4 (Optional) - Fourth directory path containing images to browse */
  "directory4"?: string,
  /** Directory 5 (Optional) - Fifth directory path containing images to browse */
  "directory5"?: string,
  /** Scan Subdirectories - Include images from nested folders */
  "scanSubdirectories": boolean,
  /** Default Directory - Which directory to show by default when opening the extension */
  "defaultDirectory": "all" | "favorites" | "recent" | "directory1" | "directory2" | "directory3" | "directory4" | "directory5",
  /** Image Sorting - Default order used when browsing images */
  "sortOrder": "nameAsc" | "nameDesc" | "modifiedDesc" | "sizeDesc",
  /** Enable Image Cache - Cache scanned images for faster loading. Disable to always scan directories fresh. */
  "enableCache": boolean
}

/** Preferences accessible in all the extension's commands */
declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Preferences accessible in the `image-picker` command */
  export type ImagePicker = ExtensionPreferences & {}
}

declare namespace Arguments {
  /** Arguments passed to the `image-picker` command */
  export type ImagePicker = {}
}

