function createActivityWindow({ idleMs = 60000, now = Date.now } = {}) {
  let lastActivity = -Infinity;
  return {
    touch() { lastActivity = now(); },
    isActive() { return now() - lastActivity < idleMs; },
  };
}

module.exports = { createActivityWindow };
