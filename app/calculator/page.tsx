import Calculator from "@/components/calculator/Calculator";
import PageHeader from "@/components/ui/PageHeader";

export default function CalculatorPage() {
  return (
    <main className="phase-in mx-auto max-w-2xl px-4 pt-8">
      <PageHeader eyebrow="Quick maths" title="Calculator" />
      <Calculator />
    </main>
  );
}
