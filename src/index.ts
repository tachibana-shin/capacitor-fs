/* eslint-disable functional/no-throw-statement */

import type {
  Filesystem as CFS,
  Directory,
  Encoding as FSEncoding,
} from "@capacitor/filesystem";
import { encode } from "base-64";
import minimatch from "minimatch";
import mitt from "mitt";
import { extname, join, relative } from "path-cross";

import { Stat, StatBigInt } from "./Stat";
import { EEXIST, EISDIR, ENOENT, ENOTDIR, ENOTEMPTY, EPERM } from "./errors";
import {
  alwayBase64,
  arrayBufferToBase64,
  base64ToArrayBuffer,
  isParentFolder,
  pathEquals,
  pathEqualsOrParent,
  rawText,
  textToArrayBuffer,
} from "./utils";

async function fixStartsWidth<T>(callback: { (): Promise<T> }): Promise<T> {
  const { startsWith } = String.prototype;
  // eslint-disable-next-line functional/immutable-data
  String.prototype.startsWith = function (children) {
    // eslint-disable-next-line functional/no-this-expression
    return isParentFolder(children, this as string);
  };
  const result = await callback();
  // eslint-disable-next-line functional/immutable-data
  String.prototype.startsWith = startsWith;
  return result;
}

type EncodingBuffer = "buffer";
type EncodingString = "utf8" | "utf16" | "ascii" | "base64";
type Encoding = EncodingString | EncodingBuffer;

export type Events = {
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

type OptionsConstructor = {
  readonly rootDir?: string;
  readonly directory: Directory;
  readonly base64Alway?: boolean;
  readonly watcher?: boolean;
};

export function createFilesystem(
  Filesystem: typeof CFS,
  options: OptionsConstructor
) {
  const {
    rootDir = "/",
    directory,
    base64Alway = false,
    watcher = true,
  } = options

  const emitter = watcher ? mitt<Events>() : void 0;

  async function initRootDir(autofix = false): Promise<void> {
    try {
      const fstat = await stat("/");

      if (autofix) {
        if (fstat.isDirectory() === false) {
          await unlink("/");

          throw new Error("ROOT_IS_NOT_DIR");
        }
      }
    } catch {
      await mkdir("", {
        recursive: true,
      });
    }
  }
  async function clear(): Promise<void> {
    try {
      await Promise.all(
        (
          await readdir("")
        ).map((item) =>
          unlink(item, {
            removeAll: true,
          })
        )
      );
      // eslint-disable-next-line no-empty
    } catch {}
  }

  function joinToRootDir(path: string): string {
    return join("./", rootDir, path);
  }
  function relativeByRootDir(path: string): string {
    return relative(joinToRootDir(""), joinToRootDir(path));
  }
  function isEqual(path1: string, path2: string): boolean {
    return pathEquals(relativeByRootDir(path1), relativeByRootDir(path2));
  }
  function isParentDir(parent: string, path: string): boolean {
    return isParentFolder(relativeByRootDir(parent), relativeByRootDir(path));
  }
  function replaceParentDir(path: string, from: string, to: string): string {
    if (isParentDir(from, path)) {
      return relativeByRootDir(
        join(
          relativeByRootDir(to),
          relative(relativeByRootDir(from), relativeByRootDir(path))
        )
      );
    }

    return path;
  }

  async function mkdir(
    path: string,
    options?: {
      readonly recursive?: boolean;
    }
  ): Promise<void> {
    const { recursive = false } = options || {};
    try {
      await Filesystem.mkdir({
        path: joinToRootDir(path),
        directory: directory,
        recursive,
      });
      emitter?.emit("create:dir", relativeByRootDir(path));
    } catch (err) {
      switch (err.message) {
        case "Current directory does already exist.":
          throw new EEXIST(path);
        case "Parent directory must exist":
          throw new ENOENT(path);
        default:
          throw err;
      }
    }
  }
  async function rmdir(
    path: string,
    options?: {
      readonly recursive?: boolean;
    }
  ): Promise<void> {
    const { recursive = false } = options || {};
    try {
      await Filesystem.rmdir({
        path: joinToRootDir(path),
        directory: directory,
        recursive,
      });
      emitter?.emit("remove:dir", relativeByRootDir(path));
    } catch (err) {
      switch (err.message) {
        case "Folder is not empty":
          throw new ENOTEMPTY(path);
        case "Folder does not exist.":
          throw new ENOENT(path);
        default:
          throw err;
      }
    }
  }
  async function readdir(path: string): Promise<readonly string[]> {
    if ((await stat(path)).isDirectory()) {
      return await Filesystem.readdir({
        path: joinToRootDir(path),
        directory: directory,
      }).then(({ files }) => files);
    } else {
      throw new ENOTDIR(path);
    }
  }
  async function writeFile(
    path: string,
    data: ArrayBuffer | Blob | string,
    options?:
      | {
          readonly recursive?: boolean;
          readonly encoding?: Encoding;
        }
      | Encoding
  ) {
    // eslint-disable-next-line functional/no-let
    let { encoding } =
      typeof options === "string"
        ? { encoding: options }
        : options || { encoding: "utf8" };
    const { recursive = false } =
      typeof options === "string" ? {} : options || {};

    try {
      if ((await stat(path)).isDirectory()) {
        throw new EISDIR(path);
      }
    } catch (err) {
      if (err instanceof ENOENT === false) {
        throw err;
      }
    }

    if (data instanceof Blob) {
      data = await data.arrayBuffer();
    }
    if (data instanceof Uint8Array || data instanceof Uint16Array) {
      data = data.buffer;
    }
    if (data instanceof ArrayBuffer) {
      data = arrayBufferToBase64(data);
      encoding = "base64";
    }

    if (base64Alway && typeof data === "string") {
      if (encoding !== "base64") {
        data = encode(data);
      }
      encoding = "base64";
    }

    try {
      try {
        await Filesystem.writeFile({
          path: joinToRootDir(path),
          directory: directory,
          encoding:
            encoding === "base64" || encoding === "buffer"
              ? void 0
              : (encoding as FSEncoding),
          data,
          recursive,
        });
        emitter?.emit("write:file", relativeByRootDir(path));
      } catch (err) {
        if (recursive) {
          await Filesystem.writeFile({
            path: joinToRootDir(path),
            directory: directory,
            encoding:
              encoding === "base64" || encoding === "buffer"
                ? void 0
                : (encoding as FSEncoding),
            data,
            recursive: false,
          });
          emitter?.emit("write:file", relativeByRootDir(path));
        } else {
          throw err;
        }
      }
    } catch (err) {
      if (err.message === "Parent directory must exist") {
        throw new ENOENT(path);
      } else {
        throw err;
      }
    }
  }
  async function readFile(
    path: string,
    options?:
      | {
          readonly encoding?: EncodingBuffer;
        }
      | EncodingBuffer
  ): Promise<ArrayBuffer>;
  async function readFile(
    path: string,
    options:
      | {
          readonly encoding: EncodingString;
        }
      | EncodingString
  ): Promise<string>;
  async function readFile(
    path: string,
    options:
      | {
          readonly encoding: Encoding;
        }
      | Encoding
  ): Promise<string | ArrayBuffer>;
  async function readFile(
    path: string,
    options:
      | {
          readonly encoding?: Encoding;
        }
      | Encoding = "buffer"
  ): Promise<string | ArrayBuffer> {
    const { encoding = "buffer" } =
      typeof options === "string" ? { encoding: options } : options || {};

    try {
      if (base64Alway) {
        const { data } = await Filesystem.readFile({
          path: joinToRootDir(path),
          directory: directory,
        }); //  alway result base64

        if (encoding === "buffer") {
          return base64ToArrayBuffer(alwayBase64(data));
        }
        if (encoding === "base64") {
          return alwayBase64(data);
        }

        return rawText(data);
      }

      // don't enable base64 mode
      const { data } = await Filesystem.readFile({
        path: joinToRootDir(path),
        directory: directory,
        encoding:
          encoding === "buffer" || encoding === "base64"
            ? void 0
            : (encoding as FSEncoding),
      });

      if (encoding === "buffer") {
        return textToArrayBuffer(data);
      }
      if (encoding === "base64") {
        return alwayBase64(data);
      }

      return data;
    } catch {
      throw new ENOENT(path);
    }
  }
  async function unlink(
    path: string,
    options?: {
      readonly removeAll?: boolean;
    }
  ): Promise<void> {
    const { removeAll = false } = options || {};
    const fstat = await stat(path);

    if (fstat.isDirectory()) {
      if (removeAll) {
        await rmdir(path, {
          recursive: true,
        });

        return void 0;
      }
      throw new EPERM(path);
    }

    try {
      await Filesystem.deleteFile({
        path: joinToRootDir(path),
        directory: directory,
      });
      emitter?.emit("remove:file", relativeByRootDir(path));
    } catch {
      throw new ENOENT(path);
    }
  }
  async function rename(oldPath: string, newPath: string): Promise<void> {
    try {
      await fixStartsWidth<void>(async () => {
        await Filesystem.rename({
          from: joinToRootDir(oldPath),
          to: joinToRootDir(newPath),
          directory: directory,
          toDirectory: directory,
        });

        if (emitter) {
          stat(newPath).then((stat) => {
            if (stat.isDirectory()) {
              emitter?.emit("remove:dir", relativeByRootDir(oldPath));
              emitter?.emit("create:dir", relativeByRootDir(newPath));

              emitter?.emit("move:dir", {
                from: relativeByRootDir(oldPath),
                to: relativeByRootDir(newPath),
              });
            } else {
              emitter?.emit("remove:file", relativeByRootDir(oldPath));
              emitter?.emit("write:file", relativeByRootDir(newPath));

              emitter?.emit("move:file", {
                from: relativeByRootDir(oldPath),
                to: relativeByRootDir(newPath),
              });
            }
          });
        }
      });
    } catch (err) {
      switch (err.message) {
        case "Parent directory of the to path is a file":
          throw new ENOTDIR(newPath);
        case "Cannot overwrite a directory with a file":
          throw new EISDIR(newPath);
        case "Cannot move a directory over an existing object":
          throw new EEXIST(newPath);
        default:
          throw new ENOENT(oldPath);
      }
    }
  }
  async function copy(oldPath: string, newPath: string): Promise<void> {
    try {
      await fixStartsWidth<void>(async () => {
        await Filesystem.copy({
          from: joinToRootDir(oldPath),
          to: joinToRootDir(newPath),
          directory: directory,
          toDirectory: directory,
        });
      });

      if (emitter) {
        stat(newPath).then((stat) => {
          if (stat.isDirectory()) {
            emitter?.emit("create:dir", relativeByRootDir(newPath));
          } else {
            emitter?.emit("write:file", relativeByRootDir(newPath));
          }
        });
      }
    } catch (err) {
      switch (err.message) {
        case "Parent directory of the to path is a file":
          throw new ENOTDIR(newPath);
        case "Cannot overwrite a directory with a file":
          throw new EISDIR(newPath);
        case "Cannot move a directory over an existing object":
          throw new EEXIST(newPath);
        default:
          throw new ENOENT(oldPath);
      }
    }
  }
  async function stat(path: string): Promise<Stat>;
  async function stat(
    path: string,
    options: { readonly bigint: false }
  ): Promise<Stat>;
  async function stat(
    path: string,
    options: { readonly bigint: true }
  ): Promise<StatBigInt>;
  async function stat(
    path: string,
    options: {
      readonly bigint: boolean;
    }
  ): Promise<Stat | StatBigInt>;
  async function stat(
    path: string,
    options?: {
      readonly bigint: boolean;
    }
  ): Promise<Stat | StatBigInt> {
    const { bigint = false } = options || {};
    try {
      const stat = await Filesystem.stat({
        path: joinToRootDir(path),
        directory: directory,
      });

      if (extname(path) === ".lnk") {
        // eslint-disable-next-line functional/immutable-data
        stat.type = "symlink";
      }

      if (bigint) {
        return new StatBigInt(stat);
      } else {
        return new Stat(stat);
      }
    } catch {
      throw new ENOENT(path);
    }
  }
  async function exists(path: string): Promise<boolean> {
    try {
      await stat(path);

      return true;
    } catch {
      return false;
    }
  }
  function lstat(
    path: string,
    options?: {
      readonly bigint: boolean;
    }
  ): Promise<Stat | StatBigInt> {
    const { bigint = false } = options || {};
    return stat(path, { bigint });
  }
  function symlink(target: string, path: string): Promise<void> {
    return writeFile(`${target}.lnk`, path);
  }
  function readlink(path: string): Promise<string> {
    return readFile(path, "utf8");
  }

  async function backFile(filepath: string): Promise<number> {
    const res = await fetch(filepath, { method: "HEAD" });
    if (res.status === 200) {
      return Number(res.headers.get("content-length") || 0);
    } else {
      throw new Error("ENOENT");
    }
  }
  function du(path: string): Promise<number> {
    return stat(path).then(({ size }) => Number(size));
  }
  async function getUri(path: string): Promise<string> {
    try {
      return decodeURIComponent(
        (
          await Filesystem.getUri({
            path: joinToRootDir(path),
            directory: directory,
          })
        ).uri
      ).replace(/^[a-z]+:\/\//iy, "");
    } catch {
      throw new Error("ENOENT");
    }
  }

  function on<Type extends keyof Events>(
    type: Type,
    cb: {
      (param: Events[Type]): void;
    }
  ): {
    (): void;
  } {
    emitter?.on(type, cb);

    return () => void emitter?.off(type, cb);
  }
  function watch(
    path:
      | string
      | readonly string[]
      | {
          (): string | readonly string[];
        },
    cb: {
      (param: { readonly path?: string; readonly action: keyof Events }): void;
    },
    {
      mode,
      type,
      miniOpts,
      immediate,
      exists,
    }: {
      readonly mode?: "absolute" | "relative" | "abstract";
      readonly type?: "file" | "dir" | "*";
      readonly miniOpts?: minimatch.IOptions;
      readonly immediate?: boolean;
      readonly exists?: boolean;
    } = {
      mode: void 0,
      type: "*",
      miniOpts: {},
      immediate: false,
    }
  ): {
    (): void;
  } {
    const handler = (action: keyof Events, emitter: string) => {
      if (typeof path === "function") {
        path = path();
      }
      if (typeof path === "string") {
        path = [path];
      }

      if (mode) {
        if (
          path.some((item): boolean => {
            if (mode === "absolute") {
              return pathEquals(item, emitter);
            } else if (mode === "relative") {
              return isParentFolder(item, emitter);
            } else if (mode === "abstract") {
              return pathEqualsOrParent(item, emitter);
            }

            return false;
          })
        ) {
          cb({
            path: emitter,
            action,
          });
        }
      } else {
        if (path.filter((item) => minimatch(emitter, item, miniOpts))) {
          cb({
            path: emitter,
            action,
          });
        }
      }
    };

    // eslint-disable-next-line functional/prefer-readonly-type
    const watchers: { (): void }[] = [];

    if (type === "file" || type === "*") {
      if (exists === undefined || exists === true) {
        // eslint-disable-next-line functional/immutable-data
        watchers.push(
          on("write:file", (emitter) => handler("write:file", emitter))
        );
      }
      if (exists === undefined || exists === false) {
        // eslint-disable-next-line functional/immutable-data
        watchers.push(
          on("remove:file", (emitter) => handler("remove:file", emitter))
        );
      }
    }
    if (type === "dir" || type === "*") {
      if (exists === undefined || exists === true) {
        // eslint-disable-next-line functional/immutable-data
        watchers.push(
          on("create:dir", (emitter) => handler("create:dir", emitter))
        );
      }
      if (exists === undefined || exists === false) {
        // eslint-disable-next-line functional/immutable-data
        watchers.push(
          on("remove:dir", (emitter) => handler("remove:dir", emitter))
        );
      }
    }

    if (immediate) {
      if (type === "file" || type === "*") {
        if (exists === undefined || exists === true) {
          cb({
            action: "write:file",
          });
        } else {
          cb({
            action: "remove:file",
          });
        }
      } else {
        if (exists === undefined || exists === true) {
          cb({
            action: "create:dir",
          });
        } else {
          cb({
            action: "remove:dir",
          });
        }
      }
    }

    return () => void watchers.forEach((watcher) => void watcher());
  }

  const __proto__ = {
    initRootDir,
    clear,
    relativeByRootDir,
    isEqual,
    isParentDir,
    replaceParentDir,
    mkdir,
    rmdir,
    readdir,
    writeFile,
    readFile,
    unlink,
    rename,
    copy,
    stat,
    exists,
    lstat,
    symlink,
    readlink,
    backFile,
    du,
    getUri,
    on,
    watch,
  };

  return {
    ...__proto__,
    promises: __proto__,
  };
}

// eslint-disable-next-line functional/no-class
export default (class FS {
  constructor(Filesystem: typeof CFS, options: OptionsConstructor) {
    return createFilesystem(Filesystem, options);
  }
} as unknown as typeof createFilesystem);
