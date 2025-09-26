function now() {
  return new Date().toISOString();
}

export class RoomEventLog {
  constructor() {
    this.logs = new Map();
    this.sequence = new Map();
  }

  append(roomId, type, payload = {}) {
    const seq = (this.sequence.get(roomId) || 0) + 1;
    this.sequence.set(roomId, seq);
    const record = {
      type,
      payload,
      sequence: seq,
      serverTime: now(),
    };
    if (!this.logs.has(roomId)) {
      this.logs.set(roomId, []);
    }
    this.logs.get(roomId).push(record);
    return record;
  }

  appendRoomRestart(roomId, payload) {
    return this.append(roomId, "room_restart", payload);
  }

  appendGameFinished(roomId, payload) {
    return this.append(roomId, "game_finished", payload);
  }

  replaySince(roomId, minSequence = 0) {
    const events = this.logs.get(roomId) || [];
    return events
      .filter((event) => event.sequence > minSequence)
      .map((event) => ({ ...event, payload: { ...event.payload } }));
  }

  clear(roomId) {
    this.logs.delete(roomId);
    this.sequence.delete(roomId);
  }
}
