import { type Duplex, Readable, Transform, Writable } from "std/node/stream";

export function createStringConsumer(f: (a: string) => void): Writable {
  const writable = new Writable({ decodeStrings: false, objectMode: false });
  writable._write = function (
    chunk,
    _encoding: string,
    done: (e: Error | null) => void,
  ) {
    if (chunk != null) {
      try {
        f(chunk.toString("utf8"));
      } catch (err) {
        done(err as Error | null);
        return;
      }
    }
    done(null);
  };
  return writable;
}

export function createTransformStream<T>(f: (a: T) => T): Duplex {
  const transform = new Transform({ decodeStrings: false, objectMode: false });
  transform._transform = function (
    chunk: T,
    _encoding: string,
    callback: (err: Error | null, chunk: T | null) => void,
  ) {
    if (chunk != null) {
      try {
        chunk = f(chunk);
      } catch (err) {
        callback(err as Error | null, null);
        return;
      }
    }
    callback(null, chunk);
  };
  return transform;
}

export function createTransformPrepend(s: string): Duplex {
  const transform = new Transform({ decodeStrings: false, objectMode: false });
  transform._transform = function (
    chunk: string,
    _encoding: string,
    callback: (err: Error | null, chunk: string | null) => void,
  ) {
    if (chunk != null) {
      chunk = s + chunk;
    }
    callback(null, chunk);
  };
  return transform;
}

export function stringToStream(s: string): Readable {
  const stream: Readable = new Readable({ encoding: "utf8" });
  stream.push(s);
  stream.push(null);
  return stream;
}

export function bufferToStream(b: unknown): Readable {
  const stream: Readable = new Readable();
  stream.push(b);
  stream.push(null);
  return stream;
}
