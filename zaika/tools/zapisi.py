#!/usr/bin/env python3
"""Обновляет voice/zapisi.js по файлам voice/*.mp3.
Запуск из папки zaika:  python3 tools/zapisi.py"""
import os, json
here = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'voice')
ids = sorted(f[:-4] for f in os.listdir(here) if f.endswith('.mp3'))
with open(os.path.join(here, 'zapisi.js'), 'w', encoding='utf-8') as f:
    f.write('// Список фраз, для которых есть запись voice/<id>.mp3 (создано tools/zapisi.py).\n')
    f.write('window.ZAPISI = ' + json.dumps(ids, ensure_ascii=False) + ';\n')
print(len(ids), 'записей')
