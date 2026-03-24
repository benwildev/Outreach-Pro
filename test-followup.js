const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const leads = await prisma.lead.findMany({
        where: { status: 'sent' },
        include: { campaign: true },
        orderBy: { sentAt: 'desc' },
        take: 5
    });

    for (const lead of leads) {
        console.log(`Lead: ${lead.recipientEmail}`);
        console.log(`Sent At: ${lead.sentAt}`);
        console.log(`Next Followup: ${lead.nextFollowup}`);
        console.log(`Step: ${lead.step}`);
        console.log(`Campaign Delay1: ${lead.campaign?.delay1Days}`);
        console.log(`Followup1 Body Snippet: ${lead.campaign?.followup1 ? lead.campaign.followup1.slice(0, 30) : 'EMPTY'}`);
        console.log('---');
    }
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
