#!/bin/bash
# Render the front view of the rebased tree at commit $1 and compare it with the backup's front view.
set -e
SP=/tmp/claude-0/-home-user-Deception-World/e3b46e06-f0d8-552d-88dc-50400a3b44dc/scratchpad
cd $SP
d=pipeline/safari/bisect/$1
rm -rf $d && mkdir -p $d
GIT_DIR=$SP/pipeline/safari/git-rebase git archive $1 | tar -x -C $d
for l in model-v10 model-v15 previews-v15; do ln -s $SP/work/$l $d/$l; done
NODE_PATH=/opt/node-tools/node_modules timeout 600 node tools/shot.cjs --url http://localhost:8765/$d/ --out shots/safari-05/bisect-$1 --size 700x860 --views ${2:-front} --orbits none > /dev/null 2>&1
NODE_PATH=/opt/node-tools/node_modules node pipeline/safari/pixdiff.cjs shots/safari-05/std2-backup-live/${2:-front}.png shots/safari-05/bisect-$1/${2:-front}.png | sed 's#.*"max"#"max"#'
