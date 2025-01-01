import type { Reader, Writer } from "jsr:@std/io/types";
import Docker from "npm:dockerode@4.0.2";

/******************************************************
 * Begin workarounds for this showstopper issue:
 * https://github.com/apocas/dockerode/issues/747
 * https://github.com/denoland/deno/issues/20255
 */

export const createDockerClient = (port = 3000) => {
  let tcpListener: Deno.Listener<Deno.Conn>;
  let unixConn: Deno.UnixConn;
  let closed = false;
  async function startProxy() {
    // Listen on TCP port 3000
    tcpListener = Deno.listen({ port });

    // console.log(`Listening on TCP port ${port}`);

    for await (const tcpConn of tcpListener) {
      handleConnection(tcpConn);
      if (closed) break;
    }
  }
  async function handleConnection(tcpConn: Deno.Conn) {
    try {
      if (closed) return;
      // Connect to the Unix socket at /var/run/docker.sock
      unixConn = await Deno.connect({
        transport: "unix",
        path: "/var/run/docker.sock",
      });

      // Bidirectional forwarding
      const tcpToUnix = copySocket(tcpConn, unixConn);
      const unixToTcp = copySocket(unixConn, tcpConn);

      // Wait for both copy operations to complete
      await Promise.all([tcpToUnix, unixToTcp]);
    } catch (error) {
      // console.error("Error handling connection:", error);
    } finally {
      tcpConn.close();
    }
  }
  // Utility function to copy data from one stream to another
  async function copySocket(src: Reader, dst: Writer) {
    const buffer = new Uint8Array(1024);
    while (true) {
      if (closed) break;
      const bytesRead = await src.read(buffer);
      if (bytesRead === null) break;
      let offset = 0;
      while (offset < bytesRead) {
        if (closed) break;
        const bytesWritten = await dst.write(
          buffer.subarray(offset, bytesRead),
        );
        offset += bytesWritten;
      }
    }
  }
  // Start the proxy
  startProxy();
  // and this now needs to be changed because of the above:
  // const docker = new Docker({socketPath: "/var/run/docker.sock"});
  const docker = new Docker({ protocol: "http", host: "localhost", port });
  const close = () => {
    // console.log("tcpListener", tcpListener);
    closed = true;
    tcpListener?.close();
    unixConn?.close();
  };
  return { docker, close };
};
/******************************************************
 * End workarounds for this showstopper issue:
 * https://github.com/apocas/dockerode/issues/747
 * https://github.com/denoland/deno/issues/20255
 */
