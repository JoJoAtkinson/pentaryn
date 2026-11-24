#!/bin/bash
cd "$(dirname "$0")"
ZZ_KEEP_ALL=1 ./run.sh g5 S02,S04,S07,S15 gpu --only S02.j,S04.b,S07.b,S15.b > out_g5.log 2>&1
ZZ_KEEP_ALL=1 ./run.sh r3 S04,S08,S10,S12 state --only S08.b,S10.c,S10.d,S12.d,S04.b > out_r3.log 2>&1
