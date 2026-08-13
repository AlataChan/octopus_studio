const { LocalRegistry } = require("./localRegistry");
const { ExternalRegistry } = require("./externalRegistry");
const { CommunityRegistry } = require("./communityRegistry");
const { UnifiedSkillSearch } = require("./unifiedSearch");
const { BUNDLED_EXTERNAL_INDEX } = require("./bundledIndex");

const localRegistry = new LocalRegistry();
const externalRegistry = new ExternalRegistry({
  bundledIndex: BUNDLED_EXTERNAL_INDEX,
});
const communityRegistry = new CommunityRegistry();
const unifiedSearch = new UnifiedSkillSearch({
  localRegistry,
  externalRegistry,
  communityRegistry,
});

module.exports = {
  LocalRegistry,
  ExternalRegistry,
  CommunityRegistry,
  UnifiedSkillSearch,
  localRegistry,
  externalRegistry,
  communityRegistry,
  unifiedSearch,
};
