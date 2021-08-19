/* eslint-disable functional/no-throw-statement */
/* eslint-disable functional/no-this-expression */

import {
  Directory,
  Filesystem,
  Encoding as FSEncoding,
} from "@capacitor/filesystem";
import { encode } from "base-64";
import minimatch from "minimatch";
import mitt from "mitt";
import type { Emitter } from "mitt";
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
  readonly directory?: Directory;
  readonly base64Alway?: boolean;
  readonly watcher?: boolean;
};

// eslint-disable-next-line functional/no-class
export default class FS {
  // eslint-disable-next-line functional/prefer-readonly-type
  private rootDir: string;
  // eslint-disable-next-line functional/prefer-readonly-type
  private directory: Directory;
  // eslint-disable-next-line functional/prefer-readonly-type
  private base64Alway: boolean;
  public readonly promises = this;
  // eslint-disable-next-line functional/prefer-readonly-type
  public emitter?: Emitter<Events>;

  constructor(options?: OptionsConstructor) {
    const {
      rootDir = "/",
      directory = Directory.Documents,
      base64Alway = false,
      watcher = true,
    } = options || {};

    [this.rootDir, this.directory, this.base64Alway] = [
      rootDir,
      directory,
      base64Alway,
    ];

    if (watcher) {
      this.emitter = mitt<Events>();
    }

    // eslint-disable-next-line functional/no-loop-statement
    for (const prop in this) {
      if (typeof this[prop] === "function") {
        // eslint-disable-next-line @typescript-eslint/ban-types
        this[prop] = (this[prop] as unknown as Function).bind(this);
      }
    }
  }
  async initRootDir(autofix = false): Promise<void> {
    try {
      const stat = await this.stat("/");

      if (autofix) {
        if (stat.isDirectory() === false) {
          await this.unlink("/");

          throw new Error("ROOT_IS_NOT_DIR");
        }
      }
    } catch {
      await this.mkdir("", {
        recursive: true,
      });
    }
  }
  async clear(): Promise<void> {
    try {
      await Promise.all(
        (
          await this.readdir("")
        ).map((item) =>
          this.unlink(item, {
            removeAll: true,
          })
        )
      );
    // eslint-disable-next-line no-empty
    } catch {}
  }

  private joinToRootDir(path: string): string {
    return join("./", this.rootDir, path);
  }
  public relativeByRootDir(path: string): string {
    return relative(this.joinToRootDir(""), this.joinToRootDir(path));
  }
  public isEqual(path1: string, path2: string): boolean {
    return pathEquals(
      this.relativeByRootDir(path1),
      this.relativeByRootDir(path2)
    );
  }
  public isParentDir(parent: string, path: string): boolean {
    return isParentFolder(
      this.relativeByRootDir(parent),
      this.relativeByRootDir(path)
    );
  }
  public replaceParentDir(path: string, from: string, to: string): string {
    if (this.isParentDir(from, path)) {
      return this.relativeByRootDir(
        join(
          this.relativeByRootDir(to),
          relative(this.relativeByRootDir(from), this.relativeByRootDir(path))
        )
      );
    }

    return path;
  }

  async mkdir(
    path: string,
    options?: {
      readonly recursive?: boolean;
    }
  ): Promise<void> {
    const { recursive = false } = options || {};
    try {
      await Filesystem.mkdir({
        path: this.joinToRootDir(path),
        directory: this.directory,
        recursive,
      });
      this.emitter?.emit("create:dir", this.relativeByRootDir(path));
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
  async rmdir(
    path: string,
    options?: {
      readonly recursive?: boolean;
    }
  ): Promise<void> {
    const { recursive = false } = options || {};
    try {
      await Filesystem.rmdir({
        path: this.joinToRootDir(path),
        directory: this.directory,
        recursive,
      });
      this.emitter?.emit("remove:dir", this.relativeByRootDir(path));
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
  async readdir(path: string): Promise<readonly string[]> {
    if ((await this.stat(path)).isDirectory()) {
      return await Filesystem.readdir({
        path: this.joinToRootDir(path),
        directory: this.directory,
      }).then(({ files }) => files);
    } else {
      throw new ENOTDIR(path);
    }
  }
  async writeFile(
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
      if ((await this.stat(path)).isDirectory()) {
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

    if (this.base64Alway && typeof data === "string") {
      if (encoding !== "base64") {
        data = encode(data);
      }
      encoding = "base64";
    }

    try {
      try {
        await Filesystem.writeFile({
          path: this.joinToRootDir(path),
          directory: this.directory,
          encoding:
            encoding === "base64" || encoding === "buffer"
              ? void 0
              : (encoding as FSEncoding),
          data,
          recursive,
        });
        this.emitter?.emit("write:file", this.relativeByRootDir(path));
      } catch (err) {
        if (recursive) {
          await Filesystem.writeFile({
            path: this.joinToRootDir(path),
            directory: this.directory,
            encoding:
              encoding === "base64" || encoding === "buffer"
                ? void 0
                : (encoding as FSEncoding),
            data,
            recursive: false,
          });
          this.emitter?.emit("write:file", this.relativeByRootDir(path));
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
  async readFile(
    path: string,
    options?:
      | {
          readonly encoding?: EncodingBuffer;
        }
      | EncodingBuffer
  ): Promise<ArrayBuffer>;
  async readFile(
    path: string,
    options:
      | {
          readonly encoding: EncodingString;
        }
      | EncodingString
  ): Promise<string>;
  async readFile(
    path: string,
    options:
      | {
          readonly encoding: Encoding;
        }
      | Encoding
  ): Promise<string | ArrayBuffer>;
  async readFile(
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
      if (this.base64Alway) {
        const { data } = await Filesystem.readFile({
          path: this.joinToRootDir(path),
          directory: this.directory,
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
        path: this.joinToRootDir(path),
        directory: this.directory,
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
  async unlink(
    path: string,
    options?: {
      readonly removeAll?: boolean;
    }
  ): Promise<void> {
    const { removeAll = false } = options || {};
    const stat = await this.stat(path);

    if (stat.isDirectory()) {
      if (removeAll) {
        await this.rmdir(path, {
          recursive: true,
        });

        return void 0;
      }
      throw new EPERM(path);
    }

    try {
      await Filesystem.deleteFile({
        path: this.joinToRootDir(path),
        directory: this.directory,
      });
      this.emitter?.emit("remove:file", this.relativeByRootDir(path));
    } catch {
      throw new ENOENT(path);
    }
  }
  async rename(oldPath: string, newPath: string): Promise<void> {
    try {
      await fixStartsWidth<void>(async () => {
        await Filesystem.rename({
          from: this.joinToRootDir(oldPath),
          to: this.joinToRootDir(newPath),
          directory: this.directory,
          toDirectory: this.directory,
        });

        if (this.emitter) {
          this.stat(newPath).then((stat) => {
            if (stat.isDirectory()) {
              this.emitter?.emit("remove:dir", this.relativeByRootDir(oldPath));
              this.emitter?.emit("create:dir", this.relativeByRootDir(newPath));

              this.emitter?.emit("move:dir", {
                from: this.relativeByRootDir(oldPath),
                to: this.relativeByRootDir(newPath),
              });
            } else {
              this.emitter?.emit(
                "remove:file",
                this.relativeByRootDir(oldPath)
              );
              this.emitter?.emit("write:file", this.relativeByRootDir(newPath));

              this.emitter?.emit("move:file", {
                from: this.relativeByRootDir(oldPath),
                to: this.relativeByRootDir(newPath),
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
  async copy(oldPath: string, newPath: string): Promise<void> {
    try {
      await fixStartsWidth<void>(async () => {
        await Filesystem.copy({
          from: this.joinToRootDir(oldPath),
          to: this.joinToRootDir(newPath),
          directory: this.directory,
          toDirectory: this.directory,
        });
      });

      if (this.emitter) {
        this.stat(newPath).then((stat) => {
          if (stat.isDirectory()) {
            this.emitter?.emit("create:dir", this.relativeByRootDir(newPath));
          } else {
            this.emitter?.emit("write:file", this.relativeByRootDir(newPath));
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
  async stat(path: string): Promise<Stat>;
  async stat(path: string, options: { readonly bigint: false }): Promise<Stat>;
  async stat(
    path: string,
    options: { readonly bigint: true }
  ): Promise<StatBigInt>;
  async stat(
    path: string,
    options: {
      readonly bigint: boolean;
    }
  ): Promise<Stat | StatBigInt>;
  async stat(
    path: string,
    options?: {
      readonly bigint: boolean;
    }
  ): Promise<Stat | StatBigInt> {
    const { bigint = false } = options || {};
    try {
      const stat = await Filesystem.stat({
        path: this.joinToRootDir(path),
        directory: this.directory,
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
  async exists(path: string): Promise<boolean> {
    try {
      await this.stat(path);

      return true;
    } catch {
      return false;
    }
  }
  lstat(
    path: string,
    options?: {
      readonly bigint: boolean;
    }
  ): Promise<Stat | StatBigInt> {
    const { bigint = false } = options || {};
    return this.stat(path, { bigint });
  }
  symlink(target: string, path: string): Promise<void> {
    return this.writeFile(`${target}.lnk`, path);
  }
  readlink(path: string): Promise<string> {
    return this.readFile(path, "utf8");
  }

  async backFile(filepath: string): Promise<number> {
    const res = await fetch(filepath, { method: "HEAD" });
    if (res.status === 200) {
      return Number(res.headers.get("content-length") || 0);
    } else {
      throw new Error("ENOENT");
    }
  }
  du(path: string): Promise<number> {
    return this.stat(path).then(({ size }) => Number(size));
  }
  async getUri(path: string): Promise<string> {
    try {
      return decodeURIComponent(
        (
          await Filesystem.getUri({
            path: this.joinToRootDir(path),
            directory: this.directory,
          })
        ).uri
      ).replace(/^[a-z]+:\/\//iy, "");
    } catch {
      throw new Error("ENOENT");
    }
  }

  public on<Type extends keyof Events>(
    type: Type,
    cb: {
      (param: Events[Type]): void;
    }
  ): {
    (): void;
  } {
    this.emitter?.on(type, cb);

    return () => void this.emitter?.off(type, cb);
  }
  watch(
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
          this.on("write:file", (emitter) => handler("write:file", emitter))
        );
      }
      if (exists === undefined || exists === false) {
        // eslint-disable-next-line functional/immutable-data
        watchers.push(
          this.on("remove:file", (emitter) => handler("remove:file", emitter))
        );
      }
    }
    if (type === "dir" || type === "*") {
      if (exists === undefined || exists === true) {
        // eslint-disable-next-line functional/immutable-data
        watchers.push(
          this.on("create:dir", (emitter) => handler("create:dir", emitter))
        );
      }
      if (exists === undefined || exists === false) {
        // eslint-disable-next-line functional/immutable-data
        watchers.push(
          this.on("remove:dir", (emitter) => handler("remove:dir", emitter))
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
}
