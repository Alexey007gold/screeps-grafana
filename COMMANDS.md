Restoring data from backup
```
docker run --rm -v historical_screeps_graphite_data:/target -v C:\Users\Alexey\Documents\Projects\IntelliJ\screeps:/backup alpine tar xf /backup/screeps-grafana_graphite_data -C /target --strip-components=1
docker run --rm -v historical_screeps_graphite_conf:/target -v C:\Users\Alexey\Documents\Projects\IntelliJ\screeps:/backup alpine tar xf /backup/screeps-grafana_graphite_conf -C /target --strip-components=1
docker run --rm -v historical_screeps_grafana_data:/target -v C:\Users\Alexey\Documents\Projects\IntelliJ\screeps:/backup alpine tar xf /backup/screeps-grafana_grafana_data -C /target --strip-components=1

docker run --rm -v historical_screeps_graphite_conf:/target alpine chown -R 472:472 /target # not necessary for readonly
docker run --rm -v historical_screeps_graphite_data:/target alpine chown -R 472:472 /target # not necessary for readonly
docker run --rm -v historical_screeps_grafana_data:/target alpine chown -R 472:472 /target
```
where
```
docker run --rm -v <new volume name>:/target -v <local dir with backup files>:/backup alpine tar xf /backup/screeps-grafana_graphite_data -C /target --strip-components=1
```


```
docker compose up --build -d

docker compose -f docker-compose.readonly.yml up -d
```

`whisper.py` is a patched script adding support for viewing old data without resizing the files.
`whisper_batch_resize.py` is needed only if we want to continue writing to the files with the data from 2022-2023.