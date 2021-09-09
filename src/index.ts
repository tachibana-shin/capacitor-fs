/* eslint-disable functional/no-throw-statement */

import type {
  Filesystem as CFS,
  Directory,
  Encoding as FSEncoding,
} from "@capacitor/filesystem";
import { btoa } from "js-base64";
import minimatch from "minimatch";
import mitt from "mitt";
import { dirname, extname, join, relative } from "path-cross";

import { Stat, StatBigInt } from "./Stat";
import { EEXIST, EISDIR, ENOENT, ENOTDIR, ENOTEMPTY, EPERM } from "./errors";
import {
  alwayBase64,
  arrayBufferToBase64,
  base64ToArrayBuffer,
  isParentFolder,
  pathEquals,
  rawText,
  textToArrayBuffer,
} from "./utils";

type EncodingBuffer = "buffer";
type EncodingString = "utf8" | "utf16" | "ascii" | "base64";
type Encoding = EncodingString | EncodingBuffer;

type MainEvents = {
  readonly "write:file": string;
  readonly "remove:file": string;

  readonly "create:dir": string;
  readonly "remove:dir": string;

  readonly "*": string;
};
type Events = MainEvents & {
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
  readonly warning?: boolean;
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
    warning = false,
  } = options;

  const emitter = watcher ? mitt<Events>() : void 0;

  async function init(autofix = false): Promise<void> {
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
  function relatively(path: string): string {
    return relative(joinToRootDir(""), joinToRootDir(path));
  }
  function _relative(from: string, to: string): string {
    return relative(relatively(from), relatively(to));
  }
  function isEqual(path1: string, path2: string): boolean {
    return pathEquals(relatively(path1), relatively(path2));
  }
  function isParentDir(parent: string, path: string): boolean {
    return isParentFolder(relatively(parent), relatively(path));
  }
  function replaceParentDir(path: string, from: string, to: string): string {
    if (isParentDir(from, path)) {
      return relatively(join(relatively(to), _relative(from, path)));
    }

    return path;
  }

  async function statNoThrow(path: string): Promise<Stat | null> {
    try {
      return await stat(path);
    } catch {
      return null;
    }
  }

  async function mkdir(
    path: string,
    options?: {
      readonly recursive?: boolean;
    }
  ): Promise<void> {
    const { recursive = false } = options || {};
    const statThis = await statNoThrow(path);

    /**
     * if stat & stat.isFile() -> throw
     */

    if (statThis?.isFile()) {
      throw new EEXIST(path);
    }
    if (statThis?.isDirectory() && recursive) {
      return;
    }

    if (recursive === false) {
      const parent = dirname(path);
      // if not exists -> stat throw ENO
      const statParent = await stat(parent);

      if (statParent.isDirectory() === false) {
        throw new ENOTDIR(parent);
      }
    }

    try {
      await Filesystem.mkdir({
        path: joinToRootDir(path),
        directory,
        recursive,
      });
    } catch (err) {
      if (warning) {
        console.warn(err);
      }
    }
    emitter?.emit("create:dir", relatively(path));
  }
  async function rmdir(
    path: string,
    options?: {
      readonly recursive?: boolean;
    }
  ): Promise<void> {
    const { recursive = false } = options || {};
    const statThis = await stat(path);

    if (statThis.isDirectory() === false) {
      throw new ENOENT(path);
    }

    /**
     * @description if path not exists -> stat(called by readdir) throw ENOENT
     */
    if (recursive === false && (await readdir(path)).length > 0) {
      throw new ENOTEMPTY(path);
    }

    try {
      await Filesystem.rmdir({
        path: joinToRootDir(path),
        directory: directory,
        recursive,
      });
    } catch (err) {
      if (warning) {
        console.warn(err);
      }
    }
    emitter?.emit("remove:dir", relatively(path));
  }
  async function readdir(path: string): Promise<readonly string[]> {
    if ((await stat(path)).isDirectory()) {
      try {
        return await Filesystem.readdir({
          path: joinToRootDir(path),
          directory: directory,
        }).then(({ files }) => files);
      } catch (err) {
        if (warning) {
          console.warn(err);
        }

        return [];
      }
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

    if (recursive === false && (await exists(dirname(path))) === false) {
      throw new ENOENT(dirname(path));
    }

    if (recursive) {
      await mkdir(dirname(path), {
        recursive: true,
      });
    }

    if (await isDirectory(path)) {
      throw new EISDIR(path);
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

    // data is string
    if (base64Alway && encoding !== "base64") {
      // if data is not blob
      data = btoa(data);
      encoding = "base64";
    }

    try {
      await Filesystem.writeFile({
        path: joinToRootDir(path),
        directory: directory,
        encoding:
          encoding === "base64" || encoding === "buffer"
            ? void 0
            : (encoding as FSEncoding),
        data,
      });
    } catch (err) {
      if (warning) {
        console.warn(err);
      }
    }
    emitter?.emit("write:file", relatively(path));
  }
  async function appendFile(
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

    if (recursive === false && (await exists(dirname(path))) === false) {
      throw new ENOENT(dirname(path));
    }

    if (recursive) {
      await mkdir(dirname(path), {
        recursive: true,
      });
    }

    if (await isDirectory(path)) {
      throw new EISDIR(path);
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

    // data is string
    if (base64Alway && encoding !== "base64") {
      // if data is not blob
      data = btoa(data);
      encoding = "base64";
    }

    try {
      await Filesystem.appendFile({
        path: joinToRootDir(path),
        directory: directory,
        encoding:
          encoding === "base64" || encoding === "buffer"
            ? void 0
            : (encoding as FSEncoding),
        data,
      });
    } catch (err) {
      if (warning) {
        console.warn(err);
      }
    }
    emitter?.emit("write:file", relatively(path));
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

    const statThis = await stat(path);

    if (statThis.isDirectory()) {
      throw new EISDIR(path);
    }

    try {
      if (base64Alway) {
        const { data } = await Filesystem.readFile({
          path: joinToRootDir(path),
          directory: directory,
        }); //  alway result base64

        if (encoding === "buffer") {
          return base64ToArrayBuffer(data);
        }
        if (encoding === "base64") {
          return data;
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
      emitter?.emit("remove:file", relatively(path));
    } catch {
      if (removeAll === false) {
        throw new ENOENT(path);
      }
    }
  }
  async function isDirectory(path: string): Promise<boolean> {
    try {
      if ((await stat(path)).isDirectory()) {
        return true;
      }
      // eslint-disable-next-line no-empty
    } catch {}

    return false;
  }
  async function isFile(path: string): Promise<boolean> {
    try {
      if ((await stat(path)).isFile()) {
        return true;
      }
      // eslint-disable-next-line no-empty
    } catch {}

    return false;
  }
  async function rename(oldPath: string, newPath: string): Promise<void> {
    const statOld = await stat(oldPath); // if not exists throw ENOENT

    if ((await stat(dirname(newPath))).isDirectory() === false) {
      throw new ENOTDIR(dirname(newPath));
    }

    const newPathIsDirectory = await isDirectory(newPath);
    if (newPathIsDirectory && statOld.isFile()) {
      throw new EISDIR(newPath);
    }

    /// if run it code -> statOld.type === statNew.type
    if (statOld.isDirectory() && newPathIsDirectory) {
      /// oldPath & newPath is directory
      throw new EEXIST(newPath);
    }

    try {
      await Filesystem.rename({
        from: joinToRootDir(oldPath),
        to: joinToRootDir(newPath),
        directory: directory,
        toDirectory: directory,
      });
    } catch (err) {
      if (warning) {
        console.warn(err);
      }
    }

    if (emitter) {
      stat(newPath).then((stat) => {
        if (stat.isDirectory()) {
          emitter?.emit("remove:dir", relatively(oldPath));
          emitter?.emit("create:dir", relatively(newPath));

          emitter?.emit("move:dir", {
            from: relatively(oldPath),
            to: relatively(newPath),
          });
        } else {
          emitter?.emit("remove:file", relatively(oldPath));
          emitter?.emit("write:file", relatively(newPath));

          emitter?.emit("move:file", {
            from: relatively(oldPath),
            to: relatively(newPath),
          });
        }
      });
    }
  }
  async function copy(oldPath: string, newPath: string): Promise<void> {
    const statOld = await stat(oldPath); // if not exists throw ENOENT

    if ((await stat(dirname(newPath))).isDirectory() === false) {
      throw new ENOTDIR(dirname(newPath));
    }

    const newPathIsDirectory = await isDirectory(newPath);
    if (newPathIsDirectory && statOld.isFile()) {
      throw new EISDIR(newPath);
    }

    /// if run it code -> statOld.type === statNew.type
    if (statOld.isDirectory() && newPathIsDirectory) {
      /// oldPath & newPath is directory
      throw new EEXIST(newPath);
    }

    try {
      await Filesystem.copy({
        from: joinToRootDir(oldPath),
        to: joinToRootDir(newPath),
        directory: directory,
        toDirectory: directory,
      });
    } catch (err) {
      if (warning) {
        console.warn(err);
      }
    }

    if (emitter) {
      stat(newPath).then((stat) => {
        if (stat.isDirectory()) {
          emitter?.emit("create:dir", relatively(newPath));
        } else {
          emitter?.emit("write:file", relatively(newPath));
        }
      });
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
    // eslint-disable-next-line functional/no-return-void
  ): () => void {
    emitter?.on(type, cb);

    return () => void emitter?.off(type, cb);
  }

  type WatchOptions = {
    readonly mode?: "absolute" | "relative" | "abstract";
    readonly type?: ("file" | "dir" | "*") | keyof MainEvents;
    readonly miniOpts?: minimatch.IOptions;
    readonly immediate?: boolean;
    readonly exists?: boolean;
    readonly dir?: string | (() => string | null) | null;
    readonly exclude?: readonly string[] | (() => readonly string[]);
  };
  type ActionsPossible = {
    readonly [T in keyof MainEvents]: T;
  } & {
    readonly file: "write:file" | "remove:file";
    readonly dir: "create:dir" | "remove:dir";
    readonly "*": keyof MainEvents;
  };

  function watch<ActionName extends ("file" | "dir" | "*") | keyof MainEvents>(
    path: string | readonly string[] | (() => string | readonly string[]),
    cb: (param: {
      readonly path: string;
      readonly action: ActionsPossible[ActionName];
    }) => void | Promise<void>,
    {
      mode = void 0,
      type = "*",
      miniOpts = {},
      immediate = false,
      exists,
      dir,
      exclude,
    }: WatchOptions = {}
    // eslint-disable-next-line functional/no-return-void
  ): () => void {
    miniOpts = {
      dot: true,
      ...miniOpts,
    };

    const handler = (
      action: ActionsPossible[ActionName],
      emitter: string
      // eslint-disable-next-line functional/no-return-void
    ): void => {
      // eslint-disable-next-line functional/no-let
      let $dir = dir;

      if (typeof $dir === "function") {
        $dir = $dir();
      }

      if ($dir === null) {
        //stop
        return void 0;
      }

      if ($dir && isParentDir($dir, emitter) === false) {
        return void 0;
      }

      // eslint-disable-next-line functional/no-let
      let $path = path;

      if (typeof $path === "function") {
        $path = $path();
      }
      if (typeof $path === "string") {
        $path = [$path];
      }

      // eslint-disable-next-line functional/no-let
      let $exclude = exclude;

      if (typeof $exclude === "function") {
        $exclude = $exclude();
      }
      if ($exclude) {
        if ($exclude.some((item) => minimatch(emitter, item, miniOpts))) {
          return void 0;
        }
      }

      if (mode) {
        if (
          $path.some((item): boolean => {
            if (mode === "absolute") {
              return isEqual(item, emitter);
            }

            if (mode === "relative") {
              return isParentDir(item, emitter);
            }

            if (mode === "abstract") {
              return isEqual(item, emitter) || isParentDir(item, emitter);
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
        if ($path.every((item) => minimatch(emitter, item, miniOpts))) {
          cb({
            path: emitter,
            action,
          });
        }
      }
    };

    // eslint-disable-next-line functional/prefer-readonly-type, functional/no-return-void
    const watchers: (() => void)[] = [];

    if (type === "file" || type === "*") {
      if (exists === undefined || exists === true) {
        // eslint-disable-next-line functional/immutable-data
        watchers.push(
          on("write:file", (emitter) => handler("write:file" as never, emitter))
        );
      }
      if (exists === undefined || exists === false) {
        // eslint-disable-next-line functional/immutable-data
        watchers.push(
          on("remove:file", (emitter) =>
            handler("remove:file" as never, emitter)
          )
        );
      }
    }
    if (type === "dir" || type === "*") {
      if (exists === undefined || exists === true) {
        // eslint-disable-next-line functional/immutable-data
        watchers.push(
          on("create:dir", (emitter) => handler("create:dir" as never, emitter))
        );
      }
      if (exists === undefined || exists === false) {
        // eslint-disable-next-line functional/immutable-data
        watchers.push(
          on("remove:dir", (emitter) => handler("remove:dir" as never, emitter))
        );
      }
    }

    if (type !== "file" && type !== "dir") {
      // eslint-disable-next-line functional/immutable-data
      watchers.push(on(type, (emitter) => handler(type as never, emitter)));
    }

    if (immediate) {
      // eslint-disable-next-line functional/no-let
      let $path = path;

      if (typeof $path === "function") {
        $path = $path();
      }
      if (typeof $path === "string") {
        $path = [$path];
      }

      const pathDefault = $path[0];

      if (type === "file" || type === "*") {
        if (exists === undefined || exists === true) {
          cb({
            path: pathDefault,
            action: "write:file" as never,
          });
        } else {
          cb({
            path: pathDefault,
            action: "remove:file" as never,
          });
        }
      }
      if (type === "dir") {
        if (exists === undefined || exists === true) {
          cb({
            path: pathDefault,
            action: "create:dir" as never,
          });
        } else {
          cb({
            path: pathDefault,
            action: "remove:dir" as never,
          });
        }
      }

      if (type !== "file" && type !== "dir") {
        cb({
          path: pathDefault,
          action: type as never,
        });
      }
    }

    return () => void watchers.forEach((watcher) => void watcher());
  }

  const __proto__ = {
    init,
    clear,
    relatively,
    relative: _relative,
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
    isDirectory,
    isFile,
    lstat,
    symlink,
    readlink,
    backFile,
    du,
    getUri,
    appendFile,
    on,
    watch,
  };

  return {
    ...__proto__,
    promises: __proto__,
  };
}

export default createFilesystem;

export { Stat, StatBigInt };

export type { Encoding, MainEvents };
