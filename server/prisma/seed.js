const { PrismaClient } = require("@prisma/client");
const {
  DEFAULT_LIGHT_THEME_LOGO_FILENAME,
} = require("../utils/files/defaultLogos");
const prisma = new PrismaClient();

async function seedTemplateDatabase() {
  const settings = [
    { label: "multi_user_mode", value: "false" },
    { label: "logo_filename", value: DEFAULT_LIGHT_THEME_LOGO_FILENAME },
  ];

  for (let setting of settings) {
    const existing = await prisma.system_settings.findUnique({
      where: { label: setting.label },
    });

    // Only create the setting if it doesn't already exist
    if (!existing) {
      await prisma.system_settings.create({
        data: setting,
      });
    }
  }

  const { seedDefaultAssistants } = require("./seeds/seedDefaultAssistants");
  const defaultAssistantResult = await seedDefaultAssistants(prisma);
  console.log(
    `[SEED] Default assistant templates: ${defaultAssistantResult.created} created, ${defaultAssistantResult.updated} updated, ${defaultAssistantResult.skipped} skipped`
  );
}

if (require.main === module) {
  seedTemplateDatabase()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

module.exports = {
  seedTemplateDatabase,
};
