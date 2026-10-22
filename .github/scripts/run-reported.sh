#!/usr/bin/env bash
# Menjalankan perintah dan, jika gagal, menampilkan ekor outputnya sebagai anotasi GitHub
# (log mentah tidak selalu mudah diakses). Pemakaian: run-reported.sh "<judul>" <perintah...>
set -u
title="$1"; shift
out="$(mktemp)"
"$@" 2>&1 | tee "$out"
code=${PIPESTATUS[0]}
if [ "$code" -ne 0 ]; then
  msg="$(tail -c 3500 "$out" | sed -e 's/\x1b\[[0-9;]*[A-Za-z]//g' -e 's/%/%25/g' -e 's/\r/%0D/g' | awk '{printf "%s%%0A", $0}')"
  echo "::error title=${title} gagal::${msg}"
fi
exit "$code"
