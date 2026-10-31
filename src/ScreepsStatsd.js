/**
 * hopsoft\screeps-statsd
 *
 * Licensed under the MIT license
 * For full copyright and license information, please see the LICENSE file
 *
 * @author     Bryan Conrad <bkconrad@gmail.com>
 * @copyright  2016 Bryan Conrad
 * @link       https://github.com/hopsoft/docker-graphite-statsd
 * @license    http://choosealicense.com/licenses/MIT  MIT License
 */

/**
 * SimpleClass documentation
 *
 * @since  0.1.0
 */
import fetch from 'node-fetch';
import StatsD from 'node-statsd';
import zlib from 'zlib';

export default class ScreepsStatsd {
  _host;
  _email;
  _password;
  _shards;
  _graphite;
  _prefixes;
  _token;
  _success;
  _running = false;
  _emptyShards = new Set();
  constructor(host, email, password, shards, graphite, prefixes) {
    this._host = host;
    this._email = email;
    this._password = password;
    this._shards = shards.split(",");
    this._graphite = graphite;
    this._prefixes = prefixes.split(",");
    if (this._prefixes.length < this._shards.length) {
      for (let i = 0; i < this._shards.length; i++) {
        if (!this._prefixes[i]) {
          this._prefixes[i] = "";
        }
      }
    }
    this._client = new StatsD({host: this._graphite, cacheDns: true});
    this._client.socket.on('error', err => console.error('statsd socket error:', err));
  }
  run( string ) {
    setInterval(() => this.loop(), 1000);
  }

  loop() {
    // skip the tick if the previous one (or a re-login) is still in flight
    if (this._running) return;
    this._running = true;
    this.getMemory().finally(() => { this._running = false; });
  }

  async signin() {
    if(this._token) {
      return;
    }
    console.log("New login request -", new Date());
    const response = await fetch(this._host + '/api/auth/signin', {
      method: 'POST',
      body: JSON.stringify({
        email: this._email,
        password: this._password
      }),
      headers: {
        'content-type': 'application/json'
      }
    });
    const data = await response.json();
    if (!response.ok || !data?.token) {
      throw new Error(`Signin failed (${response.status}): ${data?.error ?? 'no token in response'}`);
    }
    this._token = data.token;
  }

  async getMemory() {
    try {
      await this.signin();
    } catch (e) {
      console.error(e);
      return;
    }

    for (let i = 0; i < this._shards.length; i++) {
      const shard = this._shards[i];
      const prefix = this._prefixes[i];
      try {
        const response = await fetch(this._host + `/api/user/memory?path=stats&shard=${shard}`, {
          method: 'GET',
          headers: {
            "X-Token": this._token,
            "X-Username": this._token,
            'content-type': 'application/json',
          }
        });

        if (response.status === 401 || response.status === 403) {
          // token is no longer valid for any shard: re-login on the next tick
          this._token = undefined;
          throw new Error(`Unauthorized (${response.status})`);
        }

        this._token = response.headers.get('x-token') || this._token;
        const data = await response.json();
        if (data?.error) throw new Error(data.error);

        // empty/missing Memory.stats is not an auth problem: keep the token, skip this shard
        if (!data?.data) {
          if (!this._emptyShards.has(shard)) {
            this._emptyShards.add(shard);
            console.warn(`No memory data for shard ${shard}, skipping`);
          }
          continue;
        }
        this._emptyShards.delete(shard);

        if (typeof data.data !== 'string' || !data.data.startsWith('gz:')) {
          throw new Error(`Unexpected memory format for shard ${shard}`);
        }
        const unzippedData = JSON.parse(zlib.gunzipSync(Buffer.from(data.data.slice(3), 'base64')).toString());
        this.report(unzippedData, prefix);
      } catch (e) {
        console.error(`Shard ${shard}:`, e);
        if (!this._token) break;
      }
    }
  }

  report(data, prefix="") {
    if (!data || typeof data !== 'object') return;
    this.reportRecursive(data, prefix);
  }

  reportRecursive(data, prefix="") {
    for (const [k,v] of Object.entries(data)) {
      if (typeof v === 'object' && v !== null) {
        this.reportRecursive(v, prefix+k+'.');
      } else if (Number.isFinite(v)) {
        this._client.gauge(prefix+k, v);
      }
    }
  }
}
