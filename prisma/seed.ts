import { PrismaClient, TextMode } from "@prisma/client";

const prisma = new PrismaClient();

const texts = [
  {
    title: "Distributed Dawn",
    mode: TextMode.PROSE,
    difficulty: 1050,
    body: "Every fast system begins as a careful conversation between latency, trust, and the small promises that services make to each other."
  },
  {
    title: "React Hook Sprint",
    mode: TextMode.CODE,
    difficulty: 1250,
    language: "typescript",
    body: "const useInterval = (callback: () => void, delay: number) => {\n  useEffect(() => {\n    const id = setInterval(callback, delay);\n    return () => clearInterval(id);\n  }, [callback, delay]);\n};"
  },
  {
    title: "Quiet Velocity",
    mode: TextMode.QUOTE,
    difficulty: 950,
    body: "Speed is not hurry. It is attention moving without waste."
  }
];

async function main() {
  for (const text of texts) {
    await prisma.raceText.upsert({
      where: { title: text.title },
      update: text,
      create: text
    });
  }
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
