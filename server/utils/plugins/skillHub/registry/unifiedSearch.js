class UnifiedSkillSearch {
  constructor({
    localRegistry,
    externalRegistry,
    communityRegistry = null,
  } = {}) {
    if (!localRegistry)
      throw new Error("UnifiedSkillSearch requires localRegistry");
    if (!externalRegistry)
      throw new Error("UnifiedSkillSearch requires externalRegistry");
    this.localRegistry = localRegistry;
    this.externalRegistry = externalRegistry;
    this.communityRegistry = communityRegistry;
  }

  async search(
    query,
    {
      topN = 10,
      localOnly = false,
      externalOnly = false,
      communityOnly = false,
    } = {}
  ) {
    const q = String(query || "").trim();

    if (!externalOnly && !communityOnly) {
      await this.localRegistry.scan();
    }
    if (!localOnly && !externalOnly) {
      await this.communityRegistry?.loadIndex?.();
    }

    const local =
      externalOnly || communityOnly
        ? []
        : this.localRegistry.search(q, { topN });
    const external =
      localOnly || communityOnly
        ? []
        : await this.externalRegistry.search(q, { topN });
    const community =
      !this.communityRegistry || localOnly || externalOnly
        ? []
        : await this.communityRegistry.search(q, { topN });

    return { query: q, local, external, community };
  }

  async get(skillIdOrName) {
    const key = String(skillIdOrName || "").trim();
    if (!key) return null;

    await this.localRegistry.scan();
    const local = this.localRegistry.get(key);
    if (local) return local;

    const external = await this.externalRegistry.get(key);
    if (external) return external;

    return await this.communityRegistry?.get?.(key);
  }

  listSources() {
    return {
      localPaths: {
        builtinSkillsDir: this.localRegistry.builtinSkillsDir,
        customSkillsDir: this.localRegistry.customSkillsDir,
      },
      externalRegistries: this.externalRegistry.listSources(),
    };
  }

  async refreshExternal() {
    return await this.externalRegistry.refresh();
  }
}

module.exports = { UnifiedSkillSearch };
