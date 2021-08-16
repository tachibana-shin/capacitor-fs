/* eslint-disable functional/no-throw-statement */
/* eslint-disable functional/no-this-expression */

import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import { encode } from "base-64";
import minimatch from "minimatch";
import mitt from "mitt";
import type { Emitter } from "mitt";
import { extname, join } from "path-cross";

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

export type Events = {
  readonly "write:file": string;
  readonly "remove:file": string;

  readonly "create:dir": string;
  readonly "remove:dir": string;

  readonly "*": string;
};

type OptionsConstructor = {
  readonly rootDir?: string;
  readonly directory?: Directory;
  readonly base64Alway?: boolean;
  readonly watcher?: boolean;
};
type OptionRecursive = {
  readonly recursive?: boolean;
};
type OptionEncoding = {
  readonly encoding?: Encoding | "buffer" | "base64";
};

// eslint-disable-next-line @typescript-eslint/ban-types
type OptionsMkdir = OptionRecursive & {};
// eslint-disable-next-line @typescript-eslint/ban-types
type OptionsRmdir = OptionRecursive & {};
type OptionsWriteFile =
  | (OptionRecursive & OptionEncoding)
  | Encoding
  | "buffer"
  | "base64";
type OptionsReadFile = OptionEncoding | Encoding | "buffer" | "base64";
type OptionsUnlink = {
  readonly removeAll: boolean;
};
type OptionsStat = {
  readonly bigint: boolean;
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

  constructor(options: OptionsConstructor) {
    const {
      rootDir = "/",
      directory = Directory.Documents,
      base64Alway = false,
      watcher = true,
    } = options;

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

  private joinToRootDir(path: string): string {
    return join("./", this.rootDir, path);
  }

  async mkdir(path: string, options?: OptionsMkdir): Promise<void> {
    const { recursive = false } = options || {};
    try {
      await Filesystem.mkdir({
        path: this.joinToRootDir(path),
        directory: this.directory,
        recursive,
      });
      this.emitter?.emit("create:dir", path);
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
  async rmdir(path: string, options?: OptionsRmdir): Promise<void> {
    const { recursive = false } = options || {};
    try {
      await Filesystem.rmdir({
        path: this.joinToRootDir(path),
        directory: this.directory,
        recursive,
      });
      this.emitter?.emit("remove:dir", path);
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
    data: ArrayBuffer | Uint8Array | Blob | string,
    options?: OptionsWriteFile
  ) {
    // eslint-disable-next-line functional/no-let
    let { encoding } =
      typeof options === "string"
        ? { encoding: options }
        : options || { encoding: Encoding.UTF8 };
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

    if (this.base64Alway || encoding === "buffer" || encoding === "base64") {
      if (data instanceof ArrayBuffer) {
        data = arrayBufferToBase64(data);
      } else if (data instanceof Uint8Array) {
        data = encode(
          // eslint-disable-next-line functional/prefer-readonly-type
          String.fromCharCode.apply(null, data as unknown as number[])
        );
      } else {
        data = encode(data);
      }

      encoding = void 0;
    } else {
      if (data instanceof ArrayBuffer) {
        data = String.fromCharCode.apply(
          null,
          (encoding === Encoding.UTF16
            ? new Uint16Array(data)
            : // eslint-disable-next-line functional/prefer-readonly-type
              new Uint8Array(data)) as unknown as number[]
        );
      }

      if (data instanceof Uint8Array) {
        data = String.fromCharCode.apply(
          null,
          (encoding === Encoding.UTF16
            ? new Uint16Array(data)
            : // eslint-disable-next-line functional/prefer-readonly-type
              data) as unknown as number[]
        );
      }
    }

    try {
      try {
        await Filesystem.writeFile({
          path: this.joinToRootDir(path),
          directory: this.directory,
          encoding,
          data,
          recursive,
        });
        this.emitter?.emit("write:file", path);
      } catch (err) {
        if (recursive) {
          await Filesystem.writeFile({
            path: this.joinToRootDir(path),
            directory: this.directory,
            encoding,
            data,
            recursive: false,
          });
          this.emitter?.emit("write:file", path);
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
    options: OptionsReadFile = "buffer"
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
          encoding === "buffer" || encoding === "base64" ? void 0 : encoding,
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
  async unlink(path: string, options?: OptionsUnlink): Promise<void> {
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
      this.emitter?.emit("remove:file", path);
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
              this.emitter?.emit("remove:dir", oldPath);
              this.emitter?.emit("create:dir", newPath);
            } else {
              this.emitter?.emit("remove:file", oldPath);
              this.emitter?.emit("write:file", newPath);
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
            this.emitter?.emit("create:dir", newPath);
          } else {
            this.emitter?.emit("write:file", newPath);
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
  async stat(path: string, options?: OptionsStat): Promise<Stat | StatBigInt> {
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
  lstat(path: string, options?: OptionsStat): Promise<Stat | StatBigInt> {
    const { bigint = false } = options || {};
    return this.stat(path, { bigint });
  }
  symlink(target: string, path: string): Promise<void> {
    return this.writeFile(`${target}.lnk`, path);
  }
  readlink(path: string): Promise<string> {
    return this.readFile(path) as Promise<string>;
  }

  async backFile(filepath: string): Promise<number> {
    const res = await fetch(filepath, { method: "HEAD" });
    if (res.status === 200) {
      return (res.headers.get("content-length") || 0) as number;
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
      (param: { readonly path: string; readonly action: keyof Events }): void;
    },
    {
      absolute,
      type,
      miniOpts,
    }: {
      readonly absolute: boolean;
      readonly type: "file" | "dir" | "*";
      readonly miniOpts: minimatch.IOptions;
    } = {
      absolute: false,
      type: "*",
      miniOpts: {},
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

      if (absolute) {
        if (path.some((item) => pathEquals(item, emitter))) {
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

    switch (type) {
      case "file":
        // eslint-disable-next-line functional/immutable-data
        watchers.push(
          this.on("write:file", (emitter) => handler("write:file", emitter)),
          this.on("remove:file", (emitter) => handler("write:file", emitter))
        );
        break;
      case "dir":
        // eslint-disable-next-line functional/immutable-data
        watchers.push(
          this.on("create:dir", (emitter) => handler("write:file", emitter)),
          this.on("remove:dir", (emitter) => handler("write:file", emitter))
        );
        break;
      case "*":
        // eslint-disable-next-line functional/immutable-data
        watchers.push(
          this.on("*", (emitter) => handler("write:file", emitter))
        );
    }

    return () => void watchers.forEach((watcher) => void watcher());
  }
}
