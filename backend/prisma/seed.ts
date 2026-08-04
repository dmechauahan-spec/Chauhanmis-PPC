import 'dotenv/config';
import bcrypt from 'bcrypt';
import { PrismaClient, LineStatus, OrderPriority, UomType, UserRole } from '@prisma/client';
import { assertAdminSeedPasswordStrength, assertAdminSeedSecurityQuestionStrength } from './seedPasswordPolicy';
import { normalizeSecurityAnswer } from '../src/modules/auth/securityQuestion';

const prisma = new PrismaClient();

async function main() {
  // --- 1. Products (Model Master) ---------------------------------------
  const products = [
    {
      modelId: 'MDL-8001',
      modelName: 'SP10B2',
      productType: 'OTG',
      sku: 'SP10B2',
      taktTimeSec: 42.5,
      manpowerRequired: 5,
      noOfStations: 6,
      changeoverTimeMin: 15,
      notes: 'Flagship 10L OTG',
    },
    {
      modelId: 'MDL-8002',
      modelName: 'AF20X',
      productType: 'Air Fryer',
      sku: 'AF20X',
      taktTimeSec: 30,
      manpowerRequired: 3,
      noOfStations: 4,
      changeoverTimeMin: 10,
      notes: null,
    },
    {
      modelId: 'MDL-8003',
      modelName: 'AFO15Y',
      productType: 'Air Fryer Oven',
      sku: 'AFO15Y',
      taktTimeSec: 50,
      manpowerRequired: 6,
      noOfStations: 8,
      changeoverTimeMin: 20,
      notes: null,
    },
  ];

  for (const product of products) {
    await prisma.product.upsert({
      where: { modelId: product.modelId },
      update: product,
      create: product,
    });
  }

  // --- 2. Production Lines + compatibility -------------------------------
  const lines = [
    {
      lineId: 'L1',
      lineName: 'Line 1 – Hybrid',
      maxWorkers: 34,
      efficiencyPct: 88.5,
      status: LineStatus.Active,
      notes: 'Handles OTG and Air Fryer models',
      productTypes: ['OTG', 'Air Fryer'],
    },
    {
      lineId: 'L2',
      lineName: 'Line 2 – OTG Dedicated',
      maxWorkers: 28,
      efficiencyPct: 91,
      status: LineStatus.Active,
      notes: null,
      productTypes: ['OTG', 'Air Fryer Oven'],
    },
  ];

  for (const { productTypes, ...line } of lines) {
    await prisma.productionLine.upsert({
      where: { lineId: line.lineId },
      update: line,
      create: line,
    });
    await prisma.lineProductCompatibility.deleteMany({ where: { lineId: line.lineId } });
    await prisma.lineProductCompatibility.createMany({
      data: productTypes.map((productType) => ({ lineId: line.lineId, productType })),
    });
  }

  // --- 3. HR Teams ---------------------------------------------------------
  const hrTeams = [
    {
      teamId: 'HR1',
      teamName: 'Assembly Team',
      lineId: 'L1',
      workers: 20,
      skill: 'Multi-Skill',
      attendancePct: 92,
      shift: 'General',
      notes: null,
    },
    {
      teamId: 'HR2',
      teamName: 'Packing Team',
      lineId: 'L1',
      workers: 10,
      skill: 'Packing',
      attendancePct: 95,
      shift: 'General',
      notes: null,
    },
    {
      teamId: 'HR3',
      teamName: 'QC Team',
      lineId: 'L2',
      workers: 6,
      skill: 'QC',
      attendancePct: 90,
      shift: 'General',
      notes: null,
    },
  ];

  for (const team of hrTeams) {
    await prisma.hrTeam.upsert({ where: { teamId: team.teamId }, update: team, create: team });
  }

  // --- 4. RM Inventory -------------------------------------------------------
  const rmParts = [
    { partId: 'PART-OUTERFAN-SP10', stock: 500 },
    { partId: 'PART-MOTOR-SP10', stock: 300 },
    { partId: 'PART-HEATER-AF20', stock: 200 },
    { partId: 'PART-BASKET-AF20', stock: 150 },
    { partId: 'PART-DOORGLASS-AFO15', stock: 100 },
  ];

  for (const part of rmParts) {
    await prisma.rmInventory.upsert({ where: { partId: part.partId }, update: part, create: part });
  }

  // --- 5. BOM Components ---------------------------------------------------
  await prisma.bomComponent.deleteMany({ where: { modelRef: { in: ['SP10B2', 'AF20X', 'AFO15Y'] } } });
  await prisma.bomComponent.createMany({
    data: [
      { modelRef: 'SP10B2', uom: UomType.Pcs, partName: 'Outer fan housing', qtyPerUnit: 1, partId: 'PART-OUTERFAN-SP10' },
      { modelRef: 'SP10B2', uom: UomType.Pcs, partName: 'Motor assembly', qtyPerUnit: 1, partId: 'PART-MOTOR-SP10' },
      { modelRef: 'AF20X', uom: UomType.Pcs, partName: 'Heating element', qtyPerUnit: 1, partId: 'PART-HEATER-AF20' },
      { modelRef: 'AF20X', uom: UomType.Pcs, partName: 'Frying basket', qtyPerUnit: 1, partId: 'PART-BASKET-AF20' },
      { modelRef: 'AFO15Y', uom: UomType.Pcs, partName: 'Door glass panel', qtyPerUnit: 1, partId: 'PART-DOORGLASS-AFO15' },
    ],
  });

  // --- 6. Orders ------------------------------------------------------------
  const inDays = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return d;
  };

  const orders = [
    {
      orderId: 'SO-1001',
      client: 'Vishal Traders',
      sku: 'SP10B2',
      product: 'OTG',
      qty: 500,
      dueDate: inDays(10),
      priority: OrderPriority.High,
    },
    {
      orderId: 'SO-1002',
      client: 'Kumar Electronics',
      sku: 'AF20X',
      product: 'Air Fryer',
      qty: 300,
      dueDate: inDays(15),
      priority: OrderPriority.Medium,
    },
    {
      orderId: 'SO-1003',
      client: 'Sharma Distributors',
      sku: 'AFO15Y',
      product: 'Air Fryer Oven',
      qty: 150,
      dueDate: inDays(20),
      priority: OrderPriority.Low,
    },
  ];

  for (const order of orders) {
    await prisma.order.upsert({ where: { orderId: order.orderId }, update: order, create: order });
  }

  // --- 7. Bootstrap the first Admin user (Authentication & Authorization) ---
  // No public self-registration exists anywhere in this API — this is the
  // only way an Admin account ever comes into existence. Reads
  // ADMIN_SEED_EMAIL/ADMIN_SEED_PASSWORD from .env; skipped (with a warning,
  // not an error) if either is missing, since seed.ts is also run against
  // environments that don't need a bootstrap admin (e.g. re-seeding master
  // data only). Idempotent via upsert, matching every other seed section —
  // re-running the seed does not create duplicate admins or reset an
  // already-changed password.
  if (process.env.ADMIN_SEED_EMAIL && process.env.ADMIN_SEED_PASSWORD) {
    assertAdminSeedPasswordStrength(process.env.ADMIN_SEED_PASSWORD);

    // Unlike the EMAIL/PASSWORD pair above (whose absence just skips
    // bootstrap-admin creation entirely — see the `else` branch), reaching
    // this point means an Admin account IS about to be created, and the
    // User model now requires a real security question for every user — so
    // a missing question/answer here is a hard failure, not a skip.
    if (!process.env.ADMIN_SEED_SECURITY_QUESTION || !process.env.ADMIN_SEED_SECURITY_ANSWER) {
      throw new Error(
        'ADMIN_SEED_SECURITY_QUESTION and ADMIN_SEED_SECURITY_ANSWER are required alongside ADMIN_SEED_EMAIL/PASSWORD — see .env.example.',
      );
    }
    assertAdminSeedSecurityQuestionStrength(
      process.env.ADMIN_SEED_SECURITY_QUESTION,
      process.env.ADMIN_SEED_SECURITY_ANSWER,
    );

    const passwordHash = await bcrypt.hash(process.env.ADMIN_SEED_PASSWORD, 10);
    const securityAnswerHash = await bcrypt.hash(
      normalizeSecurityAnswer(process.env.ADMIN_SEED_SECURITY_ANSWER),
      10,
    );
    await prisma.user.upsert({
      where: { email: process.env.ADMIN_SEED_EMAIL },
      update: {},
      create: {
        email: process.env.ADMIN_SEED_EMAIL,
        passwordHash,
        name: 'Bootstrap Admin',
        role: UserRole.Admin,
        securityQuestion: process.env.ADMIN_SEED_SECURITY_QUESTION,
        securityAnswerHash,
      },
    });
    // eslint-disable-next-line no-console
    console.log(
      `Bootstrap Admin ensured for ${process.env.ADMIN_SEED_EMAIL} — change this password after first login.`,
    );
  } else {
    // eslint-disable-next-line no-console
    console.warn('ADMIN_SEED_EMAIL/ADMIN_SEED_PASSWORD not set — skipping bootstrap Admin user creation.');
  }

  // eslint-disable-next-line no-console
  console.log('Seed complete.');
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
