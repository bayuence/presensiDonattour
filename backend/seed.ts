import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const updatedUser = await prisma.user.updateMany({
    where: {
      name: 'ence'
    },
    data: {
      dob: '2004-05-15'
    }
  });
  console.log('User updated back to YYYY-MM-DD:', updatedUser);
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
