# capacitor-fs

This is a lightning-fs based library created to support the use of filesystem on framework capacitor.

> Important: I fixed the `.startsWith()` on `@capacitor/filesystem@^1.0.3` so we don't need `fixStartsWith()` anymore. if you are using package `@capacitor/filesystem@^1.0.3` you can safely update to `capacitor-fs^0.0.40` if you use `@capacitor/filesystem` < 1.0.3 force you to install `capacitor-fs` < 0.0.39-b1

## Usage

### `createFilesystem(Filesystem, opts?)`
First, create or open a "filesystem".

```js
import { createFilesystem } from "capacitor-fs";
import { Filesystem, Directory } from "@capacitor/filesystem";

const fs = createFilesystem(Filesystem, {
   rootDir: "/",
   directory: Directory.Documents,
   base64Alway: false,
})
```

**Note: It is better not to create multiple `FS` instances using the same name in a single thread.** Memory usage will be higher as each instance maintains its own cache, and throughput may be lower as each instance will have to compete over the mutex for access to the IndexedDb store.

Options object:

| Param           | Type [= default]   | Description                                                                                                                                                                                |
| --------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `rootDir`          | string = "/"    | Top level directory where is will work                                                                                                      |
| `directory`           | Directory = Directory.Documents | What kind of directory rootDir is in. [View it](https://capacitorjs.com/docs/apis/filesystem#directory)                                                                                                                      |
| `base64Alway`       | boolean = false    | Allow fs to do full base64 permissions. this option will take care of all the silly errors about saving text files and buffer(image, audio, video, pdf...) of capacitor/filesystem. but it makes the `encoding` option of the writeFile function useless. When true it will save all data types in base64 with encoding = void 0 and preserve their encoding  |
#### Advanced usage

Make directory

Options object:

| Param  | Type [= default] | Description            |
| ------ | ---------------- | ---------------------- |
| `recursive` | recursive = false | Whether to recursively remove the contents of the directory |

### `fs.rmdir(path: string, { recursive?: boolean }): Promise<void>`

Remove directory

### `fs.readdir(path: string): Promise<string[]>`

Read directory

The callback return value is an Array of strings. NOTE: _To save time, it is NOT SORTED._ (Fun fact: Node.js' `readdir` output is not guaranteed to be sorted either. I learned that the hard way.)

### `fs.writeFile(path: string, data: ArrayBuffer | Uint8Array | Blob | string, { encoding?: Encoding | "buffer", recursive: boolean }): Promise<void>`

Options object:

| Param      | Type [= default]   | Description                      |
| ---------- | ------------------ | -------------------------------- |
| `recursive`     | boolean = false     |    Whether to create any missing parent directories.           |
| `encoding` | string = Encoding.UTF8 | The encoding to write the file in. If not provided, data is written as base64 encoded. Pass Encoding.UTF8 to write data as string. If `base64Alway = true` this option is useless. |

### `fs.readFile(path: string, { encoding?: Encoding | "buffer" }): Promise<string | ArrayBuffer>`

The result value will be a Uint8Array (if `encoding` is `'buffer'`) or (if `encoding` is `Encoding`) a string.

If `opts` is a string, it is interpreted as `{ encoding: opts }`.

Options object:

| Param      | Type [= default]   | Description                      |
| ---------- | ------------------ | -------------------------------- |
| `encoding` | Encoding | "buffer" = Encoding.UTF8 | 	The encoding to read the file in, if not provided, data is read as binary and returned as base64 encoded. Pass Encoding.UTF8 to read data as string |

### `fs.unlink(path: string): Promise<void>`

Delete a file

### `fs.rename(oldPath: string, newPath: string): Promise<void>`

Rename a file or directory

### `fs.stat(path: string, { bigint?: boolean }): Promise<Stat | StatBigInt>`

The result is a Stat object similar to the one used by Node but with fewer and slightly different properties and methods.
The included properties are:

- `type` ("file" or "dir")
- `mode`
- `size`
- `ino`
- `mtimeMs` 
- `ctimeMs`
- `uid` (fixed value of 1)
- `gid` (fixed value of 1)
- `dev` (fixed value of 1)

The included methods are:
- `isFile()`
- `isDirectory()`
- `isSymbolicLink()`

Options object:

| Param      | Type [= default]   | Description                      |
| ---------- | ------------------ | -------------------------------- |
| `bigint` | boolean = false | result StatBigInt |


### `fs.exists(path: string): Promise<boolean>`

Check file is exists

### `fs.lstat(path: string): Promise<Stat | StatBigInt>`

Like `fs.stat` except that paths to symlinks return the symlink stats not the file stats of the symlink's target.

### `fs.symlink(target: string, path: string): Promise<void>`

Create a symlink at `path` that points to `target`.

### `fs.readlink(path: string, opts?)`

Read the target of a symlink.

### `fs.backFile(filepath)`

Create or change the stat data for a file backed by HTTP.  Size is fetched with a HEAD request.  Useful when using an HTTP backend without `urlauto` set, as then files will only be readable if they have stat data.
Note that stat data is made automatically from the file `/.superblock.txt` if found on the server.  `/.superblock.txt` can be generated or updated with the [included standalone script](src/superblocktxt.js).

Options object:

| Param  | Type [= default] | Description            |
| ------ | ---------------- | ---------------------- |
| `mode` | number = 0o666   | Posix mode permissions |

### `fs.du(path: string): Promise<number>`

Returns the size of a file or directory in bytes.

### `fs.promises`

All the same functions as above, but instead of passing a callback they return a promise.

`fs.promises = fs`




## Other methods

### `fs.init(autofix?: boolean): Promise<void>`

Implement `rootDir` directory initialization if it does not exist. Options `autofix` removed `rootDir` if this is file.

### `fs.clear(): Promise<void>`

Empty `rootDir`

### `fs.relatively(path: string): string`

Returns the monotonic path of `path`. same as `path.resolve` but for `createFilesystem`

### `fs.relative(from: string, to: string): string`

Returns the relative path of `to` relative to `from`, same as `path.relative` but for `createFilesystem`

### `fs.isEqual(path1: string, path2: string): boolean`

Compare if 2 paths are the same. based on `fs.relative`. Example:

``` ts
fs.isEqual("src/index.ts", "/src/index.ts") // true
fs.isEqual("src/index.ts", "src/posix/index.ts") // false
fs.isEqual("src/index.ts", "src/posix/../index.ts") // true
```

### `fs.isParentDir(parent: string, path: string): boolean`

Compare if path is a child of parent. Example
``` ts
fs.isEqual("src", "src/index.ts") // true
fs.isEqual("src", "src/posix/../index.ts") // true
```

### `fs.replaceParentDir(path: string, parent: string, replace: string): string`

Replace parent path. based on `fs.isParentDir`

### `fs.isDirectory(path: string): Promise<boolean>`

Return `true` if `path` exists and is `directory`.

### `fs.isFile(path: string): Promise<boolean>`

Return 'true' if `path` exists and is `file`.

### `fs.appendFile(path: string, data: ArrayBuffer | Uint8Array | Blob | string, { encoding?: Encoding | "buffer", recursive: boolean }): Promise<void>`

Same as `fs.writeFile` but writes further to the file.

### `fs.on(type: Type, cb: (param: Events[Type]) => void) => () => void`

Listen for file system interaction events like `write:file`, `remove:file`, `create:dir`, `remove:dir`. Return function call cancel listener.

### `fs.watch(path, cb, options?: WatchOptions) => () => void)`

A listener function like `fs.on` but more powerful and versatile

* `path`: `string | string[] | () => string | string[]` what are we going to listen to. the input parameter is the expression pattern `path shell` or absolute path. Example `projects/*/.git/index`
* `cb`: is a function that accepts as parameter `{ path: string, action: string }`

Options object:

| Param and type                                             | Description                                                                                                                                                                                                                                                    |
|------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `mode?: "absolute" | "relative" | "abstract"`            | Listening mode. * `absolute` will treat path as absolute path using `isEqual` * `relative` will treat path as relative using `isPathParent` * `abstract` is a mixture of `absolute` and `relative` * `void 0` will treat path as the uri expression of `shell` |
| `type: ("file" | "dir" | "*") \| keyof MainEvents` = "*" | Specify which object to track                                                                                                                                                                                                                                  |
| `miniOpts?: minimatch.IOptions` = { dot: true }            | minoptions for minimatch. **only works if `options.mode = void 0`**                                                                                                                                                                                            |
| `immediate?: boolean`                                      | if set to `true`, cbr will be called as soon as tracking is registered                                                                                                                                                                                         |
| `exists?: boolean`                                         | if set to `true`, `cb` will only be called when tracking objects exist                                                                                                                                                                                         |
| `dir?: null | string | () => null | string`             | will track the path of which directory. This option is useful when `path` is a pattern
| `exclude?: string[] | (() => string[])` | Exclude                                               
                                           
                                           
## Typescript

```ts
import type { Filesystem as CFS, Directory } from "@capacitor/filesystem";
import minimatch from "minimatch";
import { Stat, StatBigInt } from "./Stat";
declare type EncodingBuffer = "buffer";
declare type EncodingString = "utf8" | "utf16" | "ascii" | "base64";
declare type Encoding = EncodingString | EncodingBuffer;
export declare type Events = {
    readonly "write:file": string;
    readonly "remove:file": string;
    readonly "create:dir": string;
    readonly "remove:dir": string;
    readonly "*": string;
    readonly "move:file": {
        readonly from: string;
        readonly to: string;
    };
    readonly "move:dir": {
        readonly from: string;
        readonly to: string;
    };
};
declare type OptionsConstructor = {
    readonly rootDir?: string;
    readonly directory: Directory;
    readonly base64Alway?: boolean;
    readonly watcher?: boolean;
    readonly warning?: boolean;
};
export declare function createFilesystem(Filesystem: typeof CFS, options: OptionsConstructor): {
    promises: {
        init: (autofix?: boolean) => Promise<void>;
        clear: () => Promise<void>;
        relatively: (path: string) => string;
        relative: (from: string, to: string) => string;
        isEqual: (path1: string, path2: string) => boolean;
        isParentDir: (parent: string, path: string) => boolean;
        replaceParentDir: (path: string, from: string, to: string) => string;
        mkdir: (path: string, options?: {
            readonly recursive?: boolean | undefined;
        } | undefined) => Promise<void>;
        rmdir: (path: string, options?: {
            readonly recursive?: boolean | undefined;
        } | undefined) => Promise<void>;
        readdir: (path: string) => Promise<readonly string[]>;
        writeFile: (path: string, data: ArrayBuffer | Blob | string, options?: Encoding | {
            readonly recursive?: boolean | undefined;
            readonly encoding?: Encoding | undefined;
        } | undefined) => Promise<void>;
        readFile: {
            (path: string, options?: "buffer" | {
                readonly encoding?: "buffer" | undefined;
            } | undefined): Promise<ArrayBuffer>;
            (path: string, options: {
                readonly encoding: EncodingString;
            } | EncodingString): Promise<string>;
            (path: string, options: {
                readonly encoding: Encoding;
            } | Encoding): Promise<string | ArrayBuffer>;
        };
        unlink: (path: string) => Promise<void>;
        rename: (oldPath: string, newPath: string) => Promise<void>;
        copy: (oldPath: string, newPath: string) => Promise<void>;
        stat: {
            (path: string): Promise<Stat>;
            (path: string, options: {
                readonly bigint: false;
            }): Promise<Stat>;
            (path: string, options: {
                readonly bigint: true;
            }): Promise<StatBigInt>;
            (path: string, options: {
                readonly bigint: boolean;
            }): Promise<Stat | StatBigInt>;
        };
        exists: (path: string) => Promise<boolean>;
        isDirectory: (path: string) => Promise<boolean>;
        isFile: (path: string) => Promise<boolean>;
        lstat: (path: string, options?: {
            readonly bigint: boolean;
        } | undefined) => Promise<Stat | StatBigInt>;
        symlink: (target: string, path: string) => Promise<void>;
        readlink: (path: string) => Promise<string>;
        backFile: (filepath: string) => Promise<number>;
        du: (path: string) => Promise<number>;
        getUri: (path: string) => Promise<string>;
        appendFile: (path: string, data: ArrayBuffer | Blob | string, options?: Encoding | {
            readonly encoding?: Encoding | undefined;
        } | undefined) => Promise<void>;
        on: <Type extends keyof Events>(type: Type, cb: (param: Events[Type]) => void) => {
            (): void;
        };
        watch: (path: string | readonly string[] | (() => string | readonly string[]), cb: (param: {
            readonly path: string;
            readonly action: keyof Events;
        }) => void | Promise<void>, { mode, type, miniOpts, immediate, exists, dir, }?: {
            readonly mode?: "absolute" | "relative" | "abstract" | undefined;
            readonly type?: "*" | "file" | "dir" | undefined;
            readonly miniOpts?: minimatch.IOptions | undefined;
            readonly immediate?: boolean | undefined;
            readonly exists?: boolean | undefined;
            readonly dir?: string | (() => string | null) | null | undefined;
        }) => {
            (): void;
        };
    };
    init: (autofix?: boolean) => Promise<void>;
    clear: () => Promise<void>;
    relatively: (path: string) => string;
    relative: (from: string, to: string) => string;
    isEqual: (path1: string, path2: string) => boolean;
    isParentDir: (parent: string, path: string) => boolean;
    replaceParentDir: (path: string, from: string, to: string) => string;
    mkdir: (path: string, options?: {
        readonly recursive?: boolean | undefined;
    } | undefined) => Promise<void>;
    rmdir: (path: string, options?: {
        readonly recursive?: boolean | undefined;
    } | undefined) => Promise<void>;
    readdir: (path: string) => Promise<readonly string[]>;
    writeFile: (path: string, data: ArrayBuffer | Blob | string, options?: Encoding | {
        readonly recursive?: boolean | undefined;
        readonly encoding?: Encoding | undefined;
    } | undefined) => Promise<void>;
    readFile: {
        (path: string, options?: "buffer" | {
            readonly encoding?: "buffer" | undefined;
        } | undefined): Promise<ArrayBuffer>;
        (path: string, options: {
            readonly encoding: EncodingString;
        } | EncodingString): Promise<string>;
        (path: string, options: {
            readonly encoding: Encoding;
        } | Encoding): Promise<string | ArrayBuffer>;
    };
    unlink: (path: string) => Promise<void>;
    rename: (oldPath: string, newPath: string) => Promise<void>;
    copy: (oldPath: string, newPath: string) => Promise<void>;
    stat: {
        (path: string): Promise<Stat>;
        (path: string, options: {
            readonly bigint: false;
        }): Promise<Stat>;
        (path: string, options: {
            readonly bigint: true;
        }): Promise<StatBigInt>;
        (path: string, options: {
            readonly bigint: boolean;
        }): Promise<Stat | StatBigInt>;
    };
    exists: (path: string) => Promise<boolean>;
    isDirectory: (path: string) => Promise<boolean>;
    isFile: (path: string) => Promise<boolean>;
    lstat: (path: string, options?: {
        readonly bigint: boolean;
    } | undefined) => Promise<Stat | StatBigInt>;
    symlink: (target: string, path: string) => Promise<void>;
    readlink: (path: string) => Promise<string>;
    backFile: (filepath: string) => Promise<number>;
    du: (path: string) => Promise<number>;
    getUri: (path: string) => Promise<string>;
    appendFile: (path: string, data: ArrayBuffer | Blob | string, options?: Encoding | {
        readonly encoding?: Encoding | undefined;
    } | undefined) => Promise<void>;
    on: <Type extends keyof Events>(type: Type, cb: (param: Events[Type]) => void) => {
        (): void;
    };
    watch: (path: string | readonly string[] | (() => string | readonly string[]), cb: (param: {
        readonly path: string;
        readonly action: keyof Events;
    }) => void | Promise<void>, { mode, type, miniOpts, immediate, exists, dir, }?: {
        readonly mode?: "absolute" | "relative" | "abstract" | undefined;
        readonly type?: "*" | "file" | "dir" | undefined;
        readonly miniOpts?: minimatch.IOptions | undefined;
        readonly immediate?: boolean | undefined;
        readonly exists?: boolean | undefined;
        readonly dir?: string | (() => string | null) | null | undefined;
    }) => {
        (): void;
    };
};
export default createFilesystem;
export { Stat, StatBigInt };
```

## License

MIT (c) 2021 [Tachibana Shin](https://github.com/tachibana-shin)