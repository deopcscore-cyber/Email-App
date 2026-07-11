/**
 * Development seed: realistic demo mailbox for building/reviewing the UI
 * before real provider sync lands in Phase 4. Also creates a dev session so
 * the app is usable without configured OAuth credentials.
 *
 * Run: pnpm --filter @novamail/api exec node prisma/seed.mjs
 */
import { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";

const prisma = new PrismaClient();

const DEV_EMAIL = process.env.SEED_EMAIL ?? "deopcscore@gmail.com";
const DEV_SESSION_TOKEN = "dev-session-token-novamail";

const now = Date.now();
const min = 60_000;
const hour = 60 * min;
const day = 24 * hour;

/** t = minutes ago */
const ago = (ms) => new Date(now - ms);

const me = { name: "Dami Oladipo", email: DEV_EMAIL };

const people = {
  sarah: { name: "Sarah Chen", email: "sarah@acme.com" },
  alex: { name: "Alex Johnson", email: "alex@brightlabs.io" },
  michael: { name: "Michael Brown", email: "michael@partnerco.com" },
  emma: { name: "Emma Wilson", email: "emma@studionorth.co" },
  notion: { name: "Notion Team", email: "team@mail.notion.so" },
  linkedin: { name: "LinkedIn", email: "updates@linkedin.com" },
  stripe: { name: "Stripe", email: "receipts@stripe.com" },
  figma: { name: "Figma", email: "team@figma.com" },
  trello: { name: "Trello", email: "updates@trello.com" },
  github: { name: "GitHub", email: "notifications@github.com" },
  vercel: { name: "Vercel", email: "notifications@vercel.com" },
};

function para(...lines) {
  return lines.join("\n\n");
}

async function main() {
  const user = await prisma.user.upsert({
    where: { email: DEV_EMAIL },
    create: { email: DEV_EMAIL, name: me.name, settings: { create: {} } },
    update: {},
  });

  // Dev session (stable token so the browser cookie survives reseeds).
  await prisma.session.upsert({
    where: {
      tokenHash: createHash("sha256").update(DEV_SESSION_TOKEN).digest("hex"),
    },
    create: {
      userId: user.id,
      tokenHash: createHash("sha256").update(DEV_SESSION_TOKEN).digest("hex"),
      userAgent: "seed",
      expiresAt: new Date(now + 30 * day),
    },
    update: { expiresAt: new Date(now + 30 * day) },
  });

  // Wipe previous seed mail for idempotency.
  await prisma.emailAccount.deleteMany({ where: { userId: user.id } });
  await prisma.label.deleteMany({ where: { userId: user.id } });

  const account = await prisma.emailAccount.create({
    data: {
      userId: user.id,
      provider: "GOOGLE",
      providerAccountId: `seed-${user.id}`,
      email: DEV_EMAIL,
      displayName: me.name,
      encryptedRefreshToken: "seed-not-a-real-token",
      scopes: [],
      syncStatus: "ACTIVE",
      color: "#6E56CF",
      lastSyncedAt: new Date(now),
    },
  });

  // Second connected mailbox, for exercising the multi-account UI in dev.
  const WORK_EMAIL = process.env.SEED_WORK_EMAIL ?? "dami@brightlabs.io";
  await prisma.emailAccount.create({
    data: {
      userId: user.id,
      provider: "MICROSOFT",
      providerAccountId: `seed-work-${user.id}`,
      email: WORK_EMAIL,
      displayName: `${me.name} (Work)`,
      encryptedRefreshToken: "seed-not-a-real-token",
      scopes: [],
      syncStatus: "ACTIVE",
      color: "#3B82F6",
      lastSyncedAt: new Date(now),
    },
  });

  // Contacts power recipient autocomplete, ranked by interactions.
  for (const [i, person] of Object.values(people).entries()) {
    await prisma.contact.create({
      data: {
        accountId: account.id,
        email: person.email,
        name: person.name,
        interactions: 20 - i,
        lastInteracted: new Date(now),
      },
    });
  }

  const labelDefs = [
    ["Work", "#6E56CF"],
    ["Personal", "#3B82F6"],
    ["Finance", "#EF4444"],
    ["Clients", "#10B981"],
    ["Newsletters", "#F59E0B"],
  ];
  const labels = {};
  for (const [name, color] of labelDefs) {
    labels[name] = await prisma.label.create({
      data: { userId: user.id, name, color },
    });
  }

  /**
   * threads: [{subject, folder?, priority, starred?, pinned?, labels: [],
   *   messages: [{from, at, body, to?, cc?, attachments?, unread?}]}]
   */
  const threads = [
    {
      subject: "Q2 Campaign Strategy",
      priority: true,
      pinned: false,
      labels: ["Work"],
      messages: [
        {
          from: people.sarah,
          at: ago(19 * min),
          unread: true,
          attachments: [
            ["Q2 Campaign Strategy.pdf", "application/pdf", 1_258_291],
            ["Timeline.png", "image/png", 2_516_582],
          ],
          body: para(
            "Hi Dami,",
            "Here's the strategy we discussed for Q2. The main focus will be on brand awareness, user acquisition, and product engagement.",
            "I've attached the detailed plan and timeline. Let me know your thoughts!",
            "Best,\nSarah",
          ),
        },
      ],
    },
    {
      subject: "Re: Product Demo",
      priority: true,
      labels: ["Work", "Clients"],
      messages: [
        {
          from: me,
          at: ago(3 * hour),
          body: para(
            "Hi Alex,",
            "Thanks for taking the time yesterday. Happy to walk through the integration surface whenever suits.",
            "Dami",
          ),
        },
        {
          from: people.alex,
          at: ago(35 * min),
          unread: true,
          body: para(
            "Thanks for the demo! Our team has a few questions about the API rate limits and the enterprise SSO options.",
            "Could we schedule 30 minutes this week?",
            "Alex",
          ),
        },
        {
          from: people.alex,
          at: ago(30 * min),
          unread: true,
          body: "One more thing — is there a sandbox environment we could poke at before the call?",
        },
      ],
    },
    {
      subject: "Your Notion workspace is ready",
      priority: false,
      labels: ["Newsletters"],
      messages: [
        {
          from: people.notion,
          at: ago(90 * min),
          unread: true,
          body: para(
            "We've set up your workspace. Get started with templates for meeting notes, roadmaps, and docs.",
            "— The Notion Team",
          ),
        },
      ],
    },
    {
      subject: "Your weekly roundup",
      priority: false,
      labels: ["Newsletters"],
      messages: [
        {
          from: people.linkedin,
          at: ago(26 * hour),
          body: "See what's trending in your network this week.",
        },
      ],
    },
    {
      subject: "Re: Partnership Opportunity",
      priority: true,
      starred: true,
      labels: ["Work"],
      messages: [
        {
          from: people.michael,
          at: ago(2 * day),
          body: para(
            "Hi Dami,",
            "Following up on our conversation at the summit — we'd love to explore a co-marketing partnership for the fall launch.",
            "Michael",
          ),
        },
        {
          from: me,
          at: ago(28 * hour),
          body: "Sounds interesting, Michael. Can you share a one-pager with the proposed scope?",
        },
        {
          from: people.michael,
          at: ago(27 * hour),
          body: "Sounds good! I'll review and get back to you.",
        },
      ],
    },
    {
      subject: "Receipt from Acme Inc.",
      priority: false,
      labels: ["Finance"],
      messages: [
        {
          from: people.stripe,
          at: ago(30 * hour),
          attachments: [["receipt-2081.pdf", "application/pdf", 48_211]],
          body: "$129.00 paid on May 20, 2026. Thanks for your business!",
        },
      ],
    },
    {
      subject: "Your team has been invited",
      priority: false,
      labels: ["Work"],
      messages: [
        {
          from: people.figma,
          at: ago(3 * day),
          body: "Join your team on Figma and start collaborating on the design system.",
        },
      ],
    },
    {
      subject: "Weekly progress update",
      priority: false,
      labels: ["Work"],
      messages: [
        {
          from: people.trello,
          at: ago(4 * day),
          body: "Here's what's been happening on your boards this week.",
        },
      ],
    },
    {
      subject: "Design review — homepage v3",
      priority: true,
      labels: ["Work", "Clients"],
      messages: [
        {
          from: people.emma,
          at: ago(5 * hour),
          unread: true,
          attachments: [["homepage-v3.fig", "application/octet-stream", 8_412_003]],
          body: para(
            "Hey Dami,",
            "V3 is ready for review. Biggest changes: simplified hero, new pricing section, and the testimonials carousel is gone (finally).",
            "Can you leave comments by Thursday? We freeze on Friday.",
            "Emma",
          ),
        },
      ],
    },
    {
      subject: "[novamail/app] CI failed on main",
      priority: false,
      labels: ["Work"],
      messages: [
        {
          from: people.github,
          at: ago(7 * hour),
          body: "Run #4821 failed: e2e/thread-view.spec.ts — timeout waiting for selector.",
        },
      ],
    },
    {
      subject: "Deployment ready: novamail-web",
      priority: false,
      labels: ["Work"],
      messages: [
        {
          from: people.vercel,
          at: ago(8 * hour),
          body: "Your deployment novamail-web-git-main is ready. Preview: https://novamail-web.vercel.app",
        },
      ],
    },
    // Snoozed
    {
      subject: "Invoice #2081 — due next week",
      priority: false,
      labels: ["Finance"],
      snoozedUntil: new Date(now + 2 * day),
      messages: [
        {
          from: people.stripe,
          at: ago(2 * day),
          body: "Your invoice #2081 for $499.00 is due on July 18.",
        },
      ],
    },
    // Sent
    {
      subject: "Offsite agenda draft",
      folder: "SENT",
      priority: false,
      labels: ["Work"],
      messages: [
        {
          from: me,
          at: ago(9 * hour),
          to: [people.sarah, people.emma],
          body: para(
            "Team,",
            "First cut of the offsite agenda attached. Tear it apart.",
            "D",
          ),
        },
      ],
    },
    // Drafts
    {
      subject: "Re: Design review — homepage v3",
      folder: "DRAFTS",
      priority: false,
      labels: [],
      messages: [
        {
          from: me,
          at: ago(2 * hour),
          draft: true,
          body: "Emma — love the direction. A few thoughts on the pricing section:",
        },
      ],
    },
    {
      subject: "Partnership one-pager feedback",
      folder: "DRAFTS",
      priority: false,
      labels: [],
      messages: [
        { from: me, at: ago(26 * hour), draft: true, body: "Michael," },
      ],
    },
    // Spam
    {
      subject: "You've been selected for an exclusive reward",
      folder: "SPAM",
      priority: false,
      labels: [],
      messages: [
        {
          from: { name: "Rewards Center", email: "win@prizes.example" },
          at: ago(12 * hour),
          unread: true,
          body: "Claim your reward now. Limited time only!",
        },
      ],
    },
    // Trash
    {
      subject: "Old meeting invite",
      folder: "TRASH",
      priority: false,
      labels: [],
      messages: [
        {
          from: people.trello,
          at: ago(6 * day),
          body: "Reminder: sprint planning Tuesday 10am.",
        },
      ],
    },
  ];

  for (const t of threads) {
    const msgs = t.messages;
    const last = msgs[msgs.length - 1];
    const unreadCount = msgs.filter((m) => m.unread === true).length;
    const thread = await prisma.thread.create({
      data: {
        accountId: account.id,
        providerThreadId: `seed-${Buffer.from(t.subject).toString("hex").slice(0, 24)}`,
        subject: t.subject,
        snippet: last.body.split("\n")[0].slice(0, 120),
        folder: t.folder ?? "INBOX",
        // Counterparties first so the list row shows "who", not the owner.
        participants: [
          ...new Map(msgs.map((m) => [m.from.email, m.from])).values(),
        ].sort((a, b) =>
          (a.email === me.email ? 1 : 0) - (b.email === me.email ? 1 : 0),
        ),
        messageCount: msgs.length,
        unreadCount,
        isStarred: t.starred ?? false,
        isPinned: t.pinned ?? false,
        isPriority: t.priority,
        hasAttachments: msgs.some((m) => (m.attachments ?? []).length > 0),
        snoozedUntil: t.snoozedUntil ?? null,
        lastMessageAt: last.at,
        labels: {
          create: (t.labels ?? []).map((name) => ({
            labelId: labels[name].id,
          })),
        },
      },
    });

    for (const [i, m] of msgs.entries()) {
      await prisma.message.create({
        data: {
          threadId: thread.id,
          accountId: account.id,
          providerMessageId: `${thread.providerThreadId}-${i}`,
          fromAddress: m.from,
          toAddresses: m.to ?? [m.from.email === me.email ? people.sarah : me],
          ccAddresses: m.cc ?? [],
          subject: t.subject,
          snippet: m.body.split("\n")[0].slice(0, 120),
          bodyText: m.body,
          bodyHtml: null,
          isRead: m.unread !== true,
          sendStatus:
            m.draft === true ? "DRAFT" : m.from.email === me.email ? "SENT" : "NONE",
          sentAt: m.from.email === me.email && m.draft !== true ? m.at : null,
          receivedAt: m.at,
          attachments: {
            create: (m.attachments ?? []).map(([filename, mimeType, sizeBytes]) => ({
              filename,
              mimeType,
              sizeBytes,
            })),
          },
        },
      });
    }
  }

  console.log(`Seeded ${threads.length} threads for ${DEV_EMAIL}`);
  console.log(`Dev session cookie: novamail_session=${DEV_SESSION_TOKEN}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
