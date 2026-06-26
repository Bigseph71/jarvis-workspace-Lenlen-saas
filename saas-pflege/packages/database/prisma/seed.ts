import { PrismaClient, SubscriptionPlan, UserRole, Locale } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const org = await prisma.organization.upsert({
    where: { id: "00000000-0000-0000-0000-000000000001" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000001",
      name: "Demo Pflegedienst GmbH",
      country: "DE",
      subscriptionPlan: SubscriptionPlan.PRO,
      planLimits: { patients: 1000, caregivers: 100, vehicles: 30, ki: true },
    },
  });

  await prisma.user.upsert({
    where: { organizationId_email: { organizationId: org.id, email: "admin@demo.de" } },
    update: {},
    create: {
      organizationId: org.id,
      role: UserRole.STRUKTUR_ADMIN,
      email: "admin@demo.de",
      // Platzhalter – im echten Flow Argon2id-Hash setzen
      passwordHash: "REPLACE_WITH_ARGON2ID_HASH",
      language: Locale.DE,
    },
  });

  console.log("Seed abgeschlossen:", org.name);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
