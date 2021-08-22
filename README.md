# capacitor-fs

This is a lightning-fs based library created to support the use of filesystem on framework capacitor.

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

### `fs.unlink(path: string, { removeAll?: boolean }): Promise<void>`

Delete a file

Options object:

| Param      | Type [= default]   | Description                      |
| ---------- | ------------------ | -------------------------------- |
| `removeAll` | boolean = false | if this option is enabled. unlink will automatically call `rmdir(path, { recursive: true })` if `path` is dir |

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


```ts
import { Directory, Encoding } from "@capacitor/filesystem";
import { Stat, StatBigInt } from "./Stat";
export default class FS {
  private rootDir;
  private directory;
  private base64Alway;
  constructor({
    rootDir,
    directory,
    base64Alway,
  }: {
    readonly rootDir: string;
    readonly directory: Directory;
    readonly base64Alway: boolean;
  });
  private joinToRootDir;
  promises: this;
  mkdir(
    path: string,
    {
      recursive,
    }?: {
      readonly recursive: boolean;
    }
  ): Promise<void>;
  rmdir(
    path: string,
    {
      recursive,
    }?: {
      readonly recursive: boolean;
    }
  ): Promise<void>;
  readdir(path: string): Promise<readonly string[]>;
  writeFile(
    path: string,
    data: ArrayBuffer | Uint8Array | Blob | string,
    {
      encoding,
      recursive,
    }?: {
      readonly encoding?: Encoding | "buffer";
      readonly recursive: boolean;
    }
  ): Promise<void>;
  readFile(
    path: string,
    {
      encoding,
    }?: {
      readonly encoding?: Encoding | "buffer";
    }
  ): Promise<string | ArrayBuffer>;
  unlink(
    path: string,
    {
      removeAll,
    }?: {
      readonly removeAll: boolean;
    }
  ): Promise<void>;
  rename(oldPath: string, newPath: string): Promise<void>;
  copy(oldPath: string, newPath: string): Promise<void>;
  stat(
    path: string,
    {
      bigint,
    }?: {
      readonly bigint: boolean;
    }
  ): Promise<Stat | StatBigInt>;
  lstat(
    path: string,
    {
      bigint,
    }?: {
      readonly bigint: boolean;
    }
  ): Promise<Stat | StatBigInt>;
  symlink(target: string, path: string): Promise<void>;
  readlink(path: string): Promise<string>;
  backFile(filepath: string): Promise<number>;
  du(path: string): Promise<number>;
}
```

## License

MIT