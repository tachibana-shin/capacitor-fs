/* eslint-disable functional/no-throw-statement */
/* eslint-disable functional/no-this-expression */

import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import { encode } from "base-64";
import mitt, { Emitter } from "mitt";
import { extname, join } from "path-cross";

import { Stat, StatBigInt } from "./Stat";
import { EEXIST, EISDIR, ENOENT, ENOTDIR, ENOTEMPTY, EPERM } from "./errors";
import {
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
    return isParentFolder(this as string, children);
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
  private emitter?: Emitter<Events>;

  constructor({
    rootDir = "/",
    directory = Directory.Documents,
    base64Alway = false,
    watcher = true,
  }: {
    readonly rootDir: string;
    readonly directory: Directory;
    readonly base64Alway: boolean;
    readonly watcher: boolean;
  }) {
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

  async mkdir(
    path: string,
    {
      recursive,
    }: {
      readonly recursive: boolean;
    } = {
      recursive: false,
    }
  ): Promise<void> {
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
  async rmdir(
    path: string,
    {
      recursive,
    }: {
      readonly recursive: boolean;
    } = {
      recursive: false,
    }
  ): Promise<void> {
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
    {
      encoding,
      recursive,
    }: {
      readonly encoding?: Encoding | "buffer";
      readonly recursive: boolean;
    } = {
      encoding: Encoding.UTF8,
      recursive: false,
    }
  ) {
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

    if (this.base64Alway || encoding === "buffer") {
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
      if (data instanceof ArrayBuffer || data instanceof Uint8Array) {
        // eslint-disable-next-line functional/prefer-readonly-type
        data = String.fromCharCode.apply(null, data as unknown as number[]);
      }
      encoding = Encoding.UTF16;
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
    options:
      | {
          readonly encoding?: Encoding | "buffer";
        }
      | string = Encoding.UTF8
  ): Promise<string | ArrayBuffer> {
    const encoding = (
      typeof options === "object"
        ? options.encoding
        : typeof options === "string"
        ? options
        : Encoding.UTF8
    ) as Encoding | "buffer" | undefined;

    try {
      if (this.base64Alway) {
        const { data } = await Filesystem.readFile({
          path: this.joinToRootDir(path),
          directory: this.directory,
        }); //  alway result base64

        if (encoding === "buffer") {
          return base64ToArrayBuffer(data);
        }

        return rawText(data);
      }

      // don't enable base64 mode
      const { data } = await Filesystem.readFile({
        path: this.joinToRootDir(path),
        directory: this.directory,
        encoding: encoding === "buffer" ? void 0 : encoding,
      });

      if (encoding === "buffer") {
        return textToArrayBuffer(data);
      }

      return data;
    } catch {
      throw new ENOENT(path);
    }
  }
  async unlink(
    path: string,
    {
      removeAll,
    }: {
      readonly removeAll: boolean;
    } = {
      removeAll: false,
    }
  ): Promise<void> {
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
          from: oldPath,
          to: newPath,
          directory: this.directory,
          toDirectory: this.directory,
        });

        this.stat(newPath).then((stat) => {
          if (stat.isDirectory()) {
            this.emitter?.emit("remove:dir", oldPath);
            this.emitter?.emit("create:dir", newPath);
          }
        });
      });
    } catch {
      throw new ENOENT(oldPath);
    }
  }
  async copy(oldPath: string, newPath: string): Promise<void> {
    try {
      await fixStartsWidth<void>(async () => {
        await Filesystem.copy({
          from: oldPath,
          to: newPath,
          directory: this.directory,
          toDirectory: this.directory,
        });
      });

      this.stat(newPath).then((stat) => {
        if (stat.isDirectory()) {
          this.emitter?.emit("create:dir", newPath);
        }
      });
    } catch {
      throw new ENOENT(oldPath);
    }
  }
  async stat(
    path: string,
    {
      bigint,
    }: {
      readonly bigint: boolean;
    } = {
      bigint: false,
    }
  ): Promise<Stat | StatBigInt> {
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
  lstat(
    path: string,
    {
      bigint,
    }: {
      readonly bigint: boolean;
    } = {
      bigint: false,
    }
  ): Promise<Stat | StatBigInt> {
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

  watch<Key extends keyof Events | "write:dir">(
    name: Key,
    path: string | false | { (): string | false },
    cb: {
      (type: Key, emitter: string): void;
    },
    absolute = false
  ): {
    (): void;
  } {
    if (name === "write:dir") {
      const watchers = [
        this.watch("write:file" as Key, path, cb),
        this.watch("remove:file" as Key, path, cb),
      ];

      return () => void watchers.forEach((watcher) => void watcher());
    }

    const cbr = (emitter: string) => {
      if (path instanceof Function) {
        path = path();
      }

      if (path === false) {
        cb(name, emitter);
      } else {
        if (
          absolute
            ? pathEquals(path, emitter)
            : pathEqualsOrParent(path, emitter)
        ) {
          cb(name, emitter);
        }
      }
    };

    this.emitter?.on(name, cbr);

    return () => void this.emitter?.off(name, cbr);
  }
}
