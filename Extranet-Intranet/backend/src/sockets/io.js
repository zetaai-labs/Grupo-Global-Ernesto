// Holds the Socket.IO server so services can push events (e.g. notifications).
let io = null

export function setIo(server) {
  io = server
}

export function getIo() {
  return io
}
