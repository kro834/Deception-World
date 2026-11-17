import { GuardedLink } from "@/components/load-gate";
import { assemblyComparisonSearch, type AssemblyRider } from "@/lib/transformation-lab-state";

type Props = {
  rider: AssemblyRider;
  form?: string;
};

export function AssemblyComparisonLink({ rider, form }: Props) {
  return (
    <GuardedLink
      className="assembly-comparison-link"
      to="/transformation-lab"
      assets={[]}
      search={assemblyComparisonSearch(rider, form)}
    >
      装着工程を比較
    </GuardedLink>
  );
}
