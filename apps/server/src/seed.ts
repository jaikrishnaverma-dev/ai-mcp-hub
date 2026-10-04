/**
 * Seed script — creates demo data for development and testing.
 *
 * Creates:
 * - A demo user
 * - A "Daily Assistant" endpoint with P1 tools
 * - A sample goal (Wedding Planning) with stories, tasks, decisions, blockers
 *
 * Run: pnpm --filter @assistant/server run seed
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase, logger } from './config/index.js';
import { User } from './modules/auth/model.js';
import { Item } from './modules/items/model.js';
import { Endpoint } from './modules/endpoints/model.js';
import { Decision } from './modules/decisions/model.js';
import { Blocker } from './modules/blockers/model.js';
import { Activity } from './modules/activity/model.js';
import { Link } from './modules/links/model.js';

async function seed() {
  await connectDatabase();
  logger.info('Seeding database...');

  // Clear existing data
  await Promise.all([
    User.deleteMany({}),
    Item.deleteMany({}),
    Endpoint.deleteMany({}),
    Decision.deleteMany({}),
    Blocker.deleteMany({}),
    Activity.deleteMany({}),
    Link.deleteMany({}),
  ]);

  // --- Create demo user ---
  const user = await User.create({
    externalId: 'demo-user-001',
    email: 'jai@example.com',
    name: 'Jai',
    timezone: 'Asia/Kolkata',
  });

  const userId = user._id;

  // --- Create Daily Assistant endpoint ---
  const endpoint = await Endpoint.create({
    ownerId: userId,
    name: 'Daily Assistant',
    toolAllowlist: [
      'get_daily_brief',
      'create_task',
      'update_task',
      'complete_task',
      'list_tasks',
      'get_task',
      'log_decision',
      'link_tasks',
      'set_blocker',
      'delete_task',
    ],
    instructions: `You are Jai's Daily Assistant. Your job is to help Jai stay organized and productive.

At the start of every conversation:
1. Call get_daily_brief to understand the current state
2. Report any overdue or blocked items
3. Suggest what to focus on

When Jai asks about a task, use get_task to get full context (decisions, blockers, history).
When something is blocked, use set_blocker to record WHY.
When a decision is made, use log_decision to record WHAT was decided and WHY.

Be concise. Don't repeat information the user already knows. Focus on what's actionable.`,
    scopes: ['read', 'write'],
    status: 'active',
  });

  logger.info({ slug: endpoint.slug }, 'Daily Assistant endpoint created');

  // --- Create sample goal: Wedding Planning ---
  const wedding = await Item.create({
    type: 'goal',
    title: "Rahul's Wedding Planning",
    body: 'Plan and execute all arrangements for Rahul\'s wedding in March 2027.',
    status: 'in_progress',
    priority: 'high',
    ownerId: userId,
    dueAt: new Date('2027-03-15'),
    tz: 'Asia/Kolkata',
  });

  // Stories under the goal
  const venueStory = await Item.create({
    type: 'story',
    title: 'Venue & Decorations',
    body: 'Find and book the wedding venue, arrange decorations.',
    status: 'in_progress',
    priority: 'high',
    parentId: wedding._id,
    ownerId: userId,
    tz: 'Asia/Kolkata',
  });

  const foodStory = await Item.create({
    type: 'story',
    title: 'Catering & Food',
    body: 'Arrange catering for all events.',
    status: 'todo',
    priority: 'high',
    parentId: wedding._id,
    ownerId: userId,
    tz: 'Asia/Kolkata',
  });

  // Tasks under Venue story
  const shortlistVenues = await Item.create({
    type: 'task',
    title: 'Shortlist 3 venues within budget',
    body: 'Visit at least 5 venues, compare rates, availability for March 2027.',
    status: 'done',
    priority: 'high',
    parentId: venueStory._id,
    ownerId: userId,
    dueAt: new Date('2026-10-01'),
    tz: 'Asia/Kolkata',
  });

  const bookVenue = await Item.create({
    type: 'task',
    title: 'Book final venue and pay advance',
    body: 'Finalize venue selection and make advance payment.',
    status: 'in_progress',
    priority: 'critical',
    parentId: venueStory._id,
    ownerId: userId,
    dueAt: new Date('2026-10-10'),
    tz: 'Asia/Kolkata',
  });

  const decorQuotes = await Item.create({
    type: 'task',
    title: 'Get decoration quotes from 3 vendors',
    status: 'blocked',
    priority: 'medium',
    parentId: venueStory._id,
    ownerId: userId,
    dueAt: new Date('2026-10-15'),
    tz: 'Asia/Kolkata',
  });

  // Tasks under Food story
  const tastingSession = await Item.create({
    type: 'task',
    title: 'Schedule tasting session with caterers',
    status: 'todo',
    priority: 'medium',
    parentId: foodStory._id,
    ownerId: userId,
    dueAt: new Date('2026-10-20'),
    tz: 'Asia/Kolkata',
  });

  const guestCount = await Item.create({
    type: 'task',
    title: 'Finalize guest count for catering',
    status: 'blocked',
    priority: 'high',
    parentId: foodStory._id,
    ownerId: userId,
    dueAt: new Date('2026-10-08'),
    tz: 'Asia/Kolkata',
  });

  // --- Create a daily task ---
  const dailyTask = await Item.create({
    type: 'task',
    title: 'Review project status and update priorities',
    status: 'todo',
    priority: 'medium',
    ownerId: userId,
    dueAt: new Date(), // due today
    tz: 'Asia/Kolkata',
  });

  // --- Links ---
  // Decoration quotes depend on venue being booked
  await Link.create({
    fromId: decorQuotes._id,
    toId: bookVenue._id,
    kind: 'depends_on',
  });

  // Tasting session depends on guest count
  await Link.create({
    fromId: tastingSession._id,
    toId: guestCount._id,
    kind: 'depends_on',
  });

  // --- Decisions ---
  await Decision.create({
    itemId: shortlistVenues._id,
    summary: 'Shortlisted Royal Orchid, Grand Palace, and Riverside Resort',
    rationale: 'All within budget (15-20L), available in March, good reviews. Royal Orchid has the best parking.',
    decidedBy: userId,
  });

  // --- Blockers ---
  await Blocker.create({
    itemId: decorQuotes._id,
    reason: 'Cannot get decoration quotes until venue is confirmed (layout affects decor plans)',
  });

  await Blocker.create({
    itemId: guestCount._id,
    reason: 'Waiting for Rahul to confirm family side guest list',
  });

  // --- Activity entries ---
  await Activity.create([
    {
      itemId: wedding._id,
      actorId: userId,
      actorType: 'user',
      action: 'created',
      changes: [{ field: 'title', from: null, to: wedding.title }],
    },
    {
      itemId: shortlistVenues._id,
      actorId: userId,
      actorType: 'user',
      action: 'completed',
      changes: [{ field: 'status', from: 'in_progress', to: 'done' }],
      reason: 'Visited all 5 venues over the weekend',
    },
  ]);

  logger.info({
    user: user.email,
    endpointSlug: endpoint.slug,
    goal: wedding.title,
    tasks: 5,
    links: 2,
    decisions: 1,
    blockers: 2,
  }, '✅ Seed complete');

  console.log('\n=== Seed Summary ===');
  console.log(`User: ${user.email} (${user.name})`);
  console.log(`Endpoint slug: ${endpoint.slug}`);
  console.log(`MCP URL: http://localhost:3000/mcp/${endpoint.slug}`);
  console.log(`Goal: ${wedding.title}`);
  console.log(`Tasks: 5 (1 done, 1 in_progress, 1 todo, 2 blocked)`);
  console.log('====================\n');

  await disconnectDatabase();
}

seed().catch((err) => {
  logger.fatal({ err }, 'Seed failed');
  process.exit(1);
});
