import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./tests/browser',workers:1,use:{channel:'chrome',baseURL:'http://127.0.0.1:4178'},webServer:{command:'PORT=4178 SCOPEPAY_DB=:memory: node server/index.js',url:'http://127.0.0.1:4178',reuseExistingServer:false},reporter:'list'});
