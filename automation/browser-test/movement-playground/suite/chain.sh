#!/bin/bash
cd "$(dirname "$0")"
ZZ_KEEP_ALL=1 ./run.sh p2 S01,S03,S05,S07,S14,S16 state > out_p2.log 2>&1
ZZ_KEEP_ALL=1 ./run.sh r1 S02,S04,S06,S08,S09,S10,S11,S12,S13,S15 state > out_r1.log 2>&1
