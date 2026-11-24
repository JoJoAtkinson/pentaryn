#!/bin/bash
cd "$(dirname "$0")"
ZZ_KEEP_ALL=1 ./run.sh g4 S02,S04,S10,S15 gpu > out_g4.log 2>&1
ZZ_KEEP_ALL=1 ./run.sh r2 S04,S06,S08,S10,S11,S12,S13,S14,S15 state --only S06.a,S06.e,S06.g,S08.b,S10.c,S11.a,S12.c,S13.a,S13.c,S13.d,S15.a,S04.f,S14.b > out_r2.log 2>&1
