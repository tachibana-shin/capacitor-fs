/* eslint-disable functional/no-this-expression */

import type { StatResult } from "@capacitor/filesystem";

// eslint-disable-next-line functional/no-class
export class Stat {
  public readonly type: string;
  public readonly mode: number;
  public readonly size: number;
  public readonly ino = 1;
  public readonly mtimeMs: number;
  public readonly ctimeMs: number;
  public readonly uid = 1;
  public readonly gid = 1;
  public readonly dev = 1;
  public readonly uri: string;

  constructor(stats: StatResult) {
    this.type = stats.type;
    this.size = stats.size;
    this.mtimeMs = stats.mtime;
    this.ctimeMs = stats.ctime || stats.mtime;
    this.uri = stats.uri;

    if (stats.type === "file") {
      this.mode = 438;
    } else {
      this.mode = 511;
    }
  }
  isFile(): boolean {
    return this.type === "file";
  }
  isDirectory(): boolean {
    return this.type === "directory";
  }
  isSymbolicLink(): boolean {
    return this.type === "symlink";
  }
}

// eslint-disable-next-line functional/no-class
export class StatBigInt {
  public readonly type: string;
  public readonly mode: BigInt;
  public readonly size: BigInt;
  public readonly ino = BigInt(1);
  public readonly mtimeMs: BigInt;
  public readonly ctimeMs: BigInt;
  public readonly uid = BigInt(1);
  public readonly gid = BigInt(1);
  public readonly dev = BigInt(1);
  public readonly uri: string;

  constructor(stats: StatResult) {
    this.type = stats.type;
    this.size = BigInt(stats.size);
    this.mtimeMs = BigInt(stats.mtime);
    this.ctimeMs = BigInt(stats.ctime || stats.mtime);
    this.uri = stats.uri;

    if (stats.type === "file") {
      this.mode = BigInt(438);
    } else {
      this.mode = BigInt(511);
    }
  }
  isFile(): boolean {
    return this.type === "file";
  }
  isDirectory(): boolean {
    return this.type === "directory";
  }
  isSymbolicLink(): boolean {
    return this.type === "symlink";
  }
}
