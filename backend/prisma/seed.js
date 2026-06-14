/**
 * prisma/seed.js
 *
 * Seeds the database with the flatmate accounts and group structure
 * matching the expenses_export.csv scenario.
 *
 * Membership timeline:
 *  - Aisha:  joined 2026-02-01, still active
 *  - Rohan:  joined 2026-02-01, still active
 *  - Priya:  joined 2026-02-01, still active
 *  - Meera:  joined 2026-02-01, left 2026-03-31
 *  - Sam:    joined 2026-04-10, still active
 *  - Dev:    guest (visiting friend, not a flatmate)
 *
 * Run: node prisma/seed.js
 */

require('dotenv').config();
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const FLATMATES = [
  {
    name: 'Aisha',
    email: 'aisha@flat.com',
    password: 'password123',
    avatarColor: '#6366f1',
    role: 'admin',
    joinedAt: new Date('2026-02-01'),
    leftAt: null,
  },
  {
    name: 'Rohan',
    email: 'rohan@flat.com',
    password: 'password123',
    avatarColor: '#8b5cf6',
    role: 'member',
    joinedAt: new Date('2026-02-01'),
    leftAt: null,
  },
  {
    name: 'Priya',
    email: 'priya@flat.com',
    password: 'password123',
    avatarColor: '#ec4899',
    role: 'member',
    joinedAt: new Date('2026-02-01'),
    leftAt: null,
  },
  {
    name: 'Meera',
    email: 'meera@flat.com',
    password: 'password123',
    avatarColor: '#f97316',
    role: 'member',
    joinedAt: new Date('2026-02-01'),
    leftAt: new Date('2026-03-31'), // moved out end of March
  },
  {
    name: 'Sam',
    email: 'sam@flat.com',
    password: 'password123',
    avatarColor: '#10b981',
    role: 'member',
    joinedAt: new Date('2026-04-10'), // moved in mid-April (housewarming 10th)
    leftAt: null,
  },
  {
    name: 'Dev',
    email: 'dev@guest.com',
    password: 'password123',
    avatarColor: '#06b6d4',
    role: 'member',
    joinedAt: new Date('2026-03-08'), // joined for the Goa trip
    leftAt: new Date('2026-03-14'),   // left after the trip
  },
];

async function main() {
  console.log('🌱 Starting seed...');

  // Create users
  const users = [];
  for (const flatmate of FLATMATES) {
    const passwordHash = await bcrypt.hash(flatmate.password, 12);
    const user = await prisma.user.upsert({
      where: { email: flatmate.email },
      update: { name: flatmate.name, avatarColor: flatmate.avatarColor },
      create: {
        name: flatmate.name,
        email: flatmate.email,
        passwordHash,
        avatarColor: flatmate.avatarColor,
        isGuest: false,
      },
    });
    users.push({ ...user, ...flatmate });
    console.log(`  ✓ User: ${user.name} (${user.email})`);
  }

  // Create the main group
  const group = await prisma.group.upsert({
    where: { id: 'flat-group-2026' },
    update: { name: 'Flat Expenses 2026' },
    create: {
      id: 'flat-group-2026',
      name: 'Flat Expenses 2026',
      description: 'Shared expenses for the flat — Feb to Apr 2026',
      currency: 'INR',
    },
  });
  console.log(`  ✓ Group: ${group.name} (${group.id})`);

  // Add members with correct dates
  for (const user of users) {
    await prisma.groupMember.upsert({
      where: { groupId_userId: { groupId: group.id, userId: user.id } },
      update: { leftAt: user.leftAt, joinedAt: user.joinedAt, role: user.role },
      create: {
        groupId: group.id,
        userId: user.id,
        joinedAt: user.joinedAt,
        leftAt: user.leftAt,
        role: user.role,
      },
    });
    console.log(
      `  ✓ Membership: ${user.name} — joined ${user.joinedAt.toDateString()}${user.leftAt ? ` | left ${user.leftAt.toDateString()}` : ' (active)'}`
    );
  }

  console.log('\n✅ Seed complete!');
  console.log('\nLogin credentials (all passwords: password123):');
  users.forEach((u) => console.log(`  ${u.name}: ${u.email}`));
  console.log(`\nGroup ID: ${group.id}`);
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
