function createFakeModel(scriptedTurns = []) {
  let index = 0;
  return {
    async *stream() {
      const turn = scriptedTurns[index++] || [];
      for (const event of turn) yield event;
    },
  };
}

module.exports = {
  createFakeModel,
};
