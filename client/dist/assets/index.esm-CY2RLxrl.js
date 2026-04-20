import{k as b,_ as m,l as y,m as D,E as X,o as R,F as Ae,n as k,p as ve,v as Ee,q as _e,s as Ce,t as A}from"./index-Bh11RNI_.js";const Q="@firebase/installations",M="0.6.21";/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Z=1e4,ee=`w:${M}`,te="FIS_v2",Ne="https://firebaseinstallations.googleapis.com/v1",Oe=60*60*1e3,De="installations",Re="Installations";/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Me={"missing-app-config-values":'Missing App configuration value: "{$valueName}"',"not-registered":"Firebase Installation is not registered.","installation-not-found":"Firebase Installation not found.","request-failed":'{$requestName} request failed with error "{$serverCode} {$serverStatus}: {$serverMessage}"',"app-offline":"Could not process request. Application offline.","delete-pending-registration":"Can't delete installation while there is a pending registration request."},l=new X(De,Re,Me);function ne(e){return e instanceof Ae&&e.code.includes("request-failed")}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function oe({projectId:e}){return`${Ne}/projects/${e}/installations`}function ie(e){return{token:e.token,requestStatus:2,expiresIn:Fe(e.expiresIn),creationTime:Date.now()}}async function re(e,t){const o=(await t.json()).error;return l.create("request-failed",{requestName:e,serverCode:o.code,serverMessage:o.message,serverStatus:o.status})}function ae({apiKey:e}){return new Headers({"Content-Type":"application/json",Accept:"application/json","x-goog-api-key":e})}function Pe(e,{refreshToken:t}){const n=ae(e);return n.append("Authorization",$e(t)),n}async function se(e){const t=await e();return t.status>=500&&t.status<600?e():t}function Fe(e){return Number(e.replace("s","000"))}function $e(e){return`${te} ${e}`}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function Ke({appConfig:e,heartbeatServiceProvider:t},{fid:n}){const o=oe(e),i=ae(e),r=t.getImmediate({optional:!0});if(r){const a=await r.getHeartbeatsHeader();a&&i.append("x-firebase-client",a)}const s={fid:n,authVersion:te,appId:e.appId,sdkVersion:ee},c={method:"POST",headers:i,body:JSON.stringify(s)},d=await se(()=>fetch(o,c));if(d.ok){const a=await d.json();return{fid:a.fid||n,registrationStatus:2,refreshToken:a.refreshToken,authToken:ie(a.authToken)}}else throw await re("Create Installation",d)}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function ce(e){return new Promise(t=>{setTimeout(t,e)})}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function qe(e){return btoa(String.fromCharCode(...e)).replace(/\+/g,"-").replace(/\//g,"_")}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Le=/^[cdef][\w-]{21}$/,O="";function je(){try{const e=new Uint8Array(17);(self.crypto||self.msCrypto).getRandomValues(e),e[0]=112+e[0]%16;const n=xe(e);return Le.test(n)?n:O}catch{return O}}function xe(e){return qe(e).substr(0,22)}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function I(e){return`${e.appName}!${e.appId}`}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const ue=new Map;function de(e,t){const n=I(e);fe(n,t),Ve(n,t)}function fe(e,t){const n=ue.get(e);if(n)for(const o of n)o(t)}function Ve(e,t){const n=Be();n&&n.postMessage({key:e,fid:t}),He()}let p=null;function Be(){return!p&&"BroadcastChannel"in self&&(p=new BroadcastChannel("[Firebase] FID Change"),p.onmessage=e=>{fe(e.data.key,e.data.fid)}),p}function He(){ue.size===0&&p&&(p.close(),p=null)}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const We="firebase-installations-database",Ue=1,g="firebase-installations-store";let v=null;function P(){return v||(v=R(We,Ue,{upgrade:(e,t)=>{switch(t){case 0:e.createObjectStore(g)}}})),v}async function T(e,t){const n=I(e),i=(await P()).transaction(g,"readwrite"),r=i.objectStore(g),s=await r.get(n);return await r.put(t,n),await i.done,(!s||s.fid!==t.fid)&&de(e,t.fid),t}async function pe(e){const t=I(e),o=(await P()).transaction(g,"readwrite");await o.objectStore(g).delete(t),await o.done}async function S(e,t){const n=I(e),i=(await P()).transaction(g,"readwrite"),r=i.objectStore(g),s=await r.get(n),c=t(s);return c===void 0?await r.delete(n):await r.put(c,n),await i.done,c&&(!s||s.fid!==c.fid)&&de(e,c.fid),c}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function F(e){let t;const n=await S(e.appConfig,o=>{const i=Ge(o),r=Je(e,i);return t=r.registrationPromise,r.installationEntry});return n.fid===O?{installationEntry:await t}:{installationEntry:n,registrationPromise:t}}function Ge(e){const t=e||{fid:je(),registrationStatus:0};return le(t)}function Je(e,t){if(t.registrationStatus===0){if(!navigator.onLine){const i=Promise.reject(l.create("app-offline"));return{installationEntry:t,registrationPromise:i}}const n={fid:t.fid,registrationStatus:1,registrationTime:Date.now()},o=Ye(e,n);return{installationEntry:n,registrationPromise:o}}else return t.registrationStatus===1?{installationEntry:t,registrationPromise:ze(e)}:{installationEntry:t}}async function Ye(e,t){try{const n=await Ke(e,t);return T(e.appConfig,n)}catch(n){throw ne(n)&&n.customData.serverCode===409?await pe(e.appConfig):await T(e.appConfig,{fid:t.fid,registrationStatus:0}),n}}async function ze(e){let t=await V(e.appConfig);for(;t.registrationStatus===1;)await ce(100),t=await V(e.appConfig);if(t.registrationStatus===0){const{installationEntry:n,registrationPromise:o}=await F(e);return o||n}return t}function V(e){return S(e,t=>{if(!t)throw l.create("installation-not-found");return le(t)})}function le(e){return Xe(e)?{fid:e.fid,registrationStatus:0}:e}function Xe(e){return e.registrationStatus===1&&e.registrationTime+Z<Date.now()}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function Qe({appConfig:e,heartbeatServiceProvider:t},n){const o=Ze(e,n),i=Pe(e,n),r=t.getImmediate({optional:!0});if(r){const a=await r.getHeartbeatsHeader();a&&i.append("x-firebase-client",a)}const s={installation:{sdkVersion:ee,appId:e.appId}},c={method:"POST",headers:i,body:JSON.stringify(s)},d=await se(()=>fetch(o,c));if(d.ok){const a=await d.json();return ie(a)}else throw await re("Generate Auth Token",d)}function Ze(e,{fid:t}){return`${oe(e)}/${t}/authTokens:generate`}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function $(e,t=!1){let n;const o=await S(e.appConfig,r=>{if(!ge(r))throw l.create("not-registered");const s=r.authToken;if(!t&&nt(s))return r;if(s.requestStatus===1)return n=et(e,t),r;{if(!navigator.onLine)throw l.create("app-offline");const c=it(r);return n=tt(e,c),c}});return n?await n:o.authToken}async function et(e,t){let n=await B(e.appConfig);for(;n.authToken.requestStatus===1;)await ce(100),n=await B(e.appConfig);const o=n.authToken;return o.requestStatus===0?$(e,t):o}function B(e){return S(e,t=>{if(!ge(t))throw l.create("not-registered");const n=t.authToken;return rt(n)?{...t,authToken:{requestStatus:0}}:t})}async function tt(e,t){try{const n=await Qe(e,t),o={...t,authToken:n};return await T(e.appConfig,o),n}catch(n){if(ne(n)&&(n.customData.serverCode===401||n.customData.serverCode===404))await pe(e.appConfig);else{const o={...t,authToken:{requestStatus:0}};await T(e.appConfig,o)}throw n}}function ge(e){return e!==void 0&&e.registrationStatus===2}function nt(e){return e.requestStatus===2&&!ot(e)}function ot(e){const t=Date.now();return t<e.creationTime||e.creationTime+e.expiresIn<t+Oe}function it(e){const t={requestStatus:1,requestTime:Date.now()};return{...e,authToken:t}}function rt(e){return e.requestStatus===1&&e.requestTime+Z<Date.now()}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function at(e){const t=e,{installationEntry:n,registrationPromise:o}=await F(t);return o?o.catch(console.error):$(t).catch(console.error),n.fid}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function st(e,t=!1){const n=e;return await ct(n),(await $(n,t)).token}async function ct(e){const{registrationPromise:t}=await F(e);t&&await t}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function ut(e){if(!e||!e.options)throw E("App Configuration");if(!e.name)throw E("App Name");const t=["projectId","apiKey","appId"];for(const n of t)if(!e.options[n])throw E(n);return{appName:e.name,projectId:e.options.projectId,apiKey:e.options.apiKey,appId:e.options.appId}}function E(e){return l.create("missing-app-config-values",{valueName:e})}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const we="installations",dt="installations-internal",ft=e=>{const t=e.getProvider("app").getImmediate(),n=ut(t),o=D(t,"heartbeat");return{app:t,appConfig:n,heartbeatServiceProvider:o,_delete:()=>Promise.resolve()}},pt=e=>{const t=e.getProvider("app").getImmediate(),n=D(t,we).getImmediate();return{getId:()=>at(n),getToken:i=>st(n,i)}};function lt(){m(new y(we,ft,"PUBLIC")),m(new y(dt,pt,"PRIVATE"))}lt();b(Q,M);b(Q,M,"esm2020");/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const gt="/firebase-messaging-sw.js",wt="/firebase-cloud-messaging-push-scope",he="BDOU99-h67HcA6JeFXHbSNMu7e2yNNu3RzoMj8TM4W88jITfq7ZmPvIM1Iv-4_l2LxQcYwhqby2xGpWwzjfAnG4",ht="https://fcmregistrations.googleapis.com/v1",be="google.c.a.c_id",bt="google.c.a.c_l",mt="google.c.a.ts",yt="google.c.a.e",H=1e4;var W;(function(e){e[e.DATA_MESSAGE=1]="DATA_MESSAGE",e[e.DISPLAY_NOTIFICATION=3]="DISPLAY_NOTIFICATION"})(W||(W={}));/**
 * @license
 * Copyright 2018 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License. You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under the License
 * is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express
 * or implied. See the License for the specific language governing permissions and limitations under
 * the License.
 */var h;(function(e){e.PUSH_RECEIVED="push-received",e.NOTIFICATION_CLICKED="notification-clicked"})(h||(h={}));/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function f(e){const t=new Uint8Array(e);return btoa(String.fromCharCode(...t)).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_")}function Tt(e){const t="=".repeat((4-e.length%4)%4),n=(e+t).replace(/\-/g,"+").replace(/_/g,"/"),o=atob(n),i=new Uint8Array(o.length);for(let r=0;r<o.length;++r)i[r]=o.charCodeAt(r);return i}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const _="fcm_token_details_db",kt=5,U="fcm_token_object_Store";async function It(e){if("databases"in indexedDB&&!(await indexedDB.databases()).map(r=>r.name).includes(_))return null;let t=null;return(await R(_,kt,{upgrade:async(o,i,r,s)=>{if(i<2||!o.objectStoreNames.contains(U))return;const c=s.objectStore(U),d=await c.index("fcmSenderId").get(e);if(await c.clear(),!!d){if(i===2){const a=d;if(!a.auth||!a.p256dh||!a.endpoint)return;t={token:a.fcmToken,createTime:a.createTime??Date.now(),subscriptionOptions:{auth:a.auth,p256dh:a.p256dh,endpoint:a.endpoint,swScope:a.swScope,vapidKey:typeof a.vapidKey=="string"?a.vapidKey:f(a.vapidKey)}}}else if(i===3){const a=d;t={token:a.fcmToken,createTime:a.createTime,subscriptionOptions:{auth:f(a.auth),p256dh:f(a.p256dh),endpoint:a.endpoint,swScope:a.swScope,vapidKey:f(a.vapidKey)}}}else if(i===4){const a=d;t={token:a.fcmToken,createTime:a.createTime,subscriptionOptions:{auth:f(a.auth),p256dh:f(a.p256dh),endpoint:a.endpoint,swScope:a.swScope,vapidKey:f(a.vapidKey)}}}}}})).close(),await A(_),await A("fcm_vapid_details_db"),await A("undefined"),St(t)?t:null}function St(e){if(!e||!e.subscriptionOptions)return!1;const{subscriptionOptions:t}=e;return typeof e.createTime=="number"&&e.createTime>0&&typeof e.token=="string"&&e.token.length>0&&typeof t.auth=="string"&&t.auth.length>0&&typeof t.p256dh=="string"&&t.p256dh.length>0&&typeof t.endpoint=="string"&&t.endpoint.length>0&&typeof t.swScope=="string"&&t.swScope.length>0&&typeof t.vapidKey=="string"&&t.vapidKey.length>0}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const At="firebase-messaging-database",vt=1,w="firebase-messaging-store";let C=null;function K(){return C||(C=R(At,vt,{upgrade:(e,t)=>{switch(t){case 0:e.createObjectStore(w)}}})),C}async function me(e){const t=L(e),o=await(await K()).transaction(w).objectStore(w).get(t);if(o)return o;{const i=await It(e.appConfig.senderId);if(i)return await q(e,i),i}}async function q(e,t){const n=L(e),i=(await K()).transaction(w,"readwrite");return await i.objectStore(w).put(t,n),await i.done,t}async function Et(e){const t=L(e),o=(await K()).transaction(w,"readwrite");await o.objectStore(w).delete(t),await o.done}function L({appConfig:e}){return e.appId}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const _t={"missing-app-config-values":'Missing App configuration value: "{$valueName}"',"only-available-in-window":"This method is available in a Window context.","only-available-in-sw":"This method is available in a service worker context.","permission-default":"The notification permission was not granted and dismissed instead.","permission-blocked":"The notification permission was not granted and blocked instead.","unsupported-browser":"This browser doesn't support the API's required to use the Firebase SDK.","indexed-db-unsupported":"This browser doesn't support indexedDb.open() (ex. Safari iFrame, Firefox Private Browsing, etc)","failed-service-worker-registration":"We are unable to register the default service worker. {$browserErrorMessage}","token-subscribe-failed":"A problem occurred while subscribing the user to FCM: {$errorInfo}","token-subscribe-no-token":"FCM returned no token when subscribing the user to push.","token-unsubscribe-failed":"A problem occurred while unsubscribing the user from FCM: {$errorInfo}","token-update-failed":"A problem occurred while updating the user from FCM: {$errorInfo}","token-update-no-token":"FCM returned no token when updating the user to push.","use-sw-after-get-token":"The useServiceWorker() method may only be called once and must be called before calling getToken() to ensure your service worker is used.","invalid-sw-registration":"The input to useServiceWorker() must be a ServiceWorkerRegistration.","invalid-bg-handler":"The input to setBackgroundMessageHandler() must be a function.","invalid-vapid-key":"The public VAPID key must be a string.","use-vapid-key-after-get-token":"The usePublicVapidKey() method may only be called once and must be called before calling getToken() to ensure your VAPID key is used."},u=new X("messaging","Messaging",_t);/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function Ct(e,t){const n=await x(e),o=Te(t),i={method:"POST",headers:n,body:JSON.stringify(o)};let r;try{r=await(await fetch(j(e.appConfig),i)).json()}catch(s){throw u.create("token-subscribe-failed",{errorInfo:s==null?void 0:s.toString()})}if(r.error){const s=r.error.message;throw u.create("token-subscribe-failed",{errorInfo:s})}if(!r.token)throw u.create("token-subscribe-no-token");return r.token}async function Nt(e,t){const n=await x(e),o=Te(t.subscriptionOptions),i={method:"PATCH",headers:n,body:JSON.stringify(o)};let r;try{r=await(await fetch(`${j(e.appConfig)}/${t.token}`,i)).json()}catch(s){throw u.create("token-update-failed",{errorInfo:s==null?void 0:s.toString()})}if(r.error){const s=r.error.message;throw u.create("token-update-failed",{errorInfo:s})}if(!r.token)throw u.create("token-update-no-token");return r.token}async function ye(e,t){const o={method:"DELETE",headers:await x(e)};try{const r=await(await fetch(`${j(e.appConfig)}/${t}`,o)).json();if(r.error){const s=r.error.message;throw u.create("token-unsubscribe-failed",{errorInfo:s})}}catch(i){throw u.create("token-unsubscribe-failed",{errorInfo:i==null?void 0:i.toString()})}}function j({projectId:e}){return`${ht}/projects/${e}/registrations`}async function x({appConfig:e,installations:t}){const n=await t.getToken();return new Headers({"Content-Type":"application/json",Accept:"application/json","x-goog-api-key":e.apiKey,"x-goog-firebase-installations-auth":`FIS ${n}`})}function Te({p256dh:e,auth:t,endpoint:n,vapidKey:o}){const i={web:{endpoint:n,auth:t,p256dh:e}};return o!==he&&(i.web.applicationPubKey=o),i}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Ot=7*24*60*60*1e3;async function Dt(e){const t=await Pt(e.swRegistration,e.vapidKey),n={vapidKey:e.vapidKey,swScope:e.swRegistration.scope,endpoint:t.endpoint,auth:f(t.getKey("auth")),p256dh:f(t.getKey("p256dh"))},o=await me(e.firebaseDependencies);if(o){if(Ft(o.subscriptionOptions,n))return Date.now()>=o.createTime+Ot?Mt(e,{token:o.token,createTime:Date.now(),subscriptionOptions:n}):o.token;try{await ye(e.firebaseDependencies,o.token)}catch(i){console.warn(i)}return G(e.firebaseDependencies,n)}else return G(e.firebaseDependencies,n)}async function Rt(e){const t=await me(e.firebaseDependencies);t&&(await ye(e.firebaseDependencies,t.token),await Et(e.firebaseDependencies));const n=await e.swRegistration.pushManager.getSubscription();return n?n.unsubscribe():!0}async function Mt(e,t){try{const n=await Nt(e.firebaseDependencies,t),o={...t,token:n,createTime:Date.now()};return await q(e.firebaseDependencies,o),n}catch(n){throw n}}async function G(e,t){const o={token:await Ct(e,t),createTime:Date.now(),subscriptionOptions:t};return await q(e,o),o.token}async function Pt(e,t){const n=await e.pushManager.getSubscription();return n||e.pushManager.subscribe({userVisibleOnly:!0,applicationServerKey:Tt(t)})}function Ft(e,t){const n=t.vapidKey===e.vapidKey,o=t.endpoint===e.endpoint,i=t.auth===e.auth,r=t.p256dh===e.p256dh;return n&&o&&i&&r}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function J(e){const t={from:e.from,collapseKey:e.collapse_key,messageId:e.fcmMessageId};return $t(t,e),Kt(t,e),qt(t,e),t}function $t(e,t){if(!t.notification)return;e.notification={};const n=t.notification.title;n&&(e.notification.title=n);const o=t.notification.body;o&&(e.notification.body=o);const i=t.notification.image;i&&(e.notification.image=i);const r=t.notification.icon;r&&(e.notification.icon=r)}function Kt(e,t){t.data&&(e.data=t.data)}function qt(e,t){var i,r,s,c;if(!t.fcmOptions&&!((i=t.notification)!=null&&i.click_action))return;e.fcmOptions={};const n=((r=t.fcmOptions)==null?void 0:r.link)??((s=t.notification)==null?void 0:s.click_action);n&&(e.fcmOptions.link=n);const o=(c=t.fcmOptions)==null?void 0:c.analytics_label;o&&(e.fcmOptions.analyticsLabel=o)}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function Lt(e){return typeof e=="object"&&!!e&&be in e}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function jt(e){if(!e||!e.options)throw N("App Configuration Object");if(!e.name)throw N("App Name");const t=["projectId","apiKey","appId","messagingSenderId"],{options:n}=e;for(const o of t)if(!n[o])throw N(o);return{appName:e.name,projectId:n.projectId,apiKey:n.apiKey,appId:n.appId,senderId:n.messagingSenderId}}function N(e){return u.create("missing-app-config-values",{valueName:e})}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class xt{constructor(t,n,o){this.deliveryMetricsExportedToBigQueryEnabled=!1,this.onBackgroundMessageHandler=null,this.onMessageHandler=null,this.logEvents=[],this.isLogServiceStarted=!1;const i=jt(t);this.firebaseDependencies={app:t,appConfig:i,installations:n,analyticsProvider:o}}_delete(){return Promise.resolve()}}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function ke(e){try{e.swRegistration=await navigator.serviceWorker.register(gt,{scope:wt}),e.swRegistration.update().catch(()=>{}),await Vt(e.swRegistration)}catch(t){throw u.create("failed-service-worker-registration",{browserErrorMessage:t==null?void 0:t.message})}}async function Vt(e){return new Promise((t,n)=>{const o=setTimeout(()=>n(new Error(`Service worker not registered after ${H} ms`)),H),i=e.installing||e.waiting;e.active?(clearTimeout(o),t()):i?i.onstatechange=r=>{var s;((s=r.target)==null?void 0:s.state)==="activated"&&(i.onstatechange=null,clearTimeout(o),t())}:(clearTimeout(o),n(new Error("No incoming service worker found.")))})}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function Bt(e,t){if(!t&&!e.swRegistration&&await ke(e),!(!t&&e.swRegistration)){if(!(t instanceof ServiceWorkerRegistration))throw u.create("invalid-sw-registration");e.swRegistration=t}}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function Ht(e,t){t?e.vapidKey=t:e.vapidKey||(e.vapidKey=he)}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function Ie(e,t){if(!navigator)throw u.create("only-available-in-window");if(Notification.permission==="default"&&await Notification.requestPermission(),Notification.permission!=="granted")throw u.create("permission-blocked");return await Ht(e,t==null?void 0:t.vapidKey),await Bt(e,t==null?void 0:t.serviceWorkerRegistration),Dt(e)}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function Wt(e,t,n){const o=Ut(t);(await e.firebaseDependencies.analyticsProvider.get()).logEvent(o,{message_id:n[be],message_name:n[bt],message_time:n[mt],message_device_time:Math.floor(Date.now()/1e3)})}function Ut(e){switch(e){case h.NOTIFICATION_CLICKED:return"notification_open";case h.PUSH_RECEIVED:return"notification_foreground";default:throw new Error}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function Gt(e,t){const n=t.data;if(!n.isFirebaseMessaging)return;e.onMessageHandler&&n.messageType===h.PUSH_RECEIVED&&(typeof e.onMessageHandler=="function"?e.onMessageHandler(J(n)):e.onMessageHandler.next(J(n)));const o=n.data;Lt(o)&&o[yt]==="1"&&await Wt(e,n.messageType,o)}const Y="@firebase/messaging",z="0.12.25";/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Jt=e=>{const t=new xt(e.getProvider("app").getImmediate(),e.getProvider("installations-internal").getImmediate(),e.getProvider("analytics-internal"));return navigator.serviceWorker.addEventListener("message",n=>Gt(t,n)),t},Yt=e=>{const t=e.getProvider("messaging").getImmediate();return{getToken:o=>Ie(t,o)}};function zt(){m(new y("messaging",Jt,"PUBLIC")),m(new y("messaging-internal",Yt,"PRIVATE")),b(Y,z),b(Y,z,"esm2020")}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function Xt(){try{await Ee()}catch{return!1}return typeof window<"u"&&_e()&&Ce()&&"serviceWorker"in navigator&&"PushManager"in window&&"Notification"in window&&"fetch"in window&&ServiceWorkerRegistration.prototype.hasOwnProperty("showNotification")&&PushSubscription.prototype.hasOwnProperty("getKey")}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function Qt(e){if(!navigator)throw u.create("only-available-in-window");return e.swRegistration||await ke(e),Rt(e)}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function Zt(e,t){if(!navigator)throw u.create("only-available-in-window");return e.onMessageHandler=t,()=>{e.onMessageHandler=null}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function tn(e=ve()){return Xt().then(t=>{if(!t)throw u.create("unsupported-browser")},t=>{throw u.create("indexed-db-unsupported")}),D(k(e),"messaging").getImmediate()}async function nn(e,t){return e=k(e),Ie(e,t)}function on(e){return e=k(e),Qt(e)}function rn(e,t){return e=k(e),Zt(e,t)}zt();export{on as deleteToken,tn as getMessaging,nn as getToken,Xt as isSupported,rn as onMessage};
