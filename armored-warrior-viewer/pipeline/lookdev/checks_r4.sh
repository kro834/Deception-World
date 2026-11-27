#!/bin/bash
# Round-4 checks on the final code, one browser at a time. Run from the scratchpad root.
L=logs/checks_r4.log; : > "$L"
echo "== robust.cjs" >> "$L"; node pipeline/lookdev/robust.cjs shots/lookdev-robust >> "$L" 2>&1; echo "robust exit $?" >> "$L"
echo "== optional.cjs" >> "$L"; node pipeline/lookdev/optional.cjs shots/lookdev-r4/optional >> "$L" 2>&1; echo "optional exit $?" >> "$L"
echo "== postercheck.cjs" >> "$L"; node pipeline/lookdev/postercheck.cjs >> "$L" 2>&1; echo "postercheck exit $?" >> "$L"
echo "== plaincheck.cjs" >> "$L"; node pipeline/lookdev/plaincheck.cjs shots/lookdev-r4/plaincheck >> "$L" 2>&1; echo "plaincheck exit $?" >> "$L"
echo CHECKS_DONE >> "$L"
