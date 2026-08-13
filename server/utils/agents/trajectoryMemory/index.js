"use strict";

const { resolveTrajectoryScope } = require("./scope");
const { recordTrajectory, deriveTrajectoryOutcome } = require("./recorder");
const { retrieveSimilar, renderTrajectoryBlock } = require("./retriever");
const vectorAdapter = require("./vectorAdapter");

module.exports = {
  resolveTrajectoryScope,
  recordTrajectory,
  deriveTrajectoryOutcome,
  retrieveSimilar,
  renderTrajectoryBlock,
  ...vectorAdapter,
};
