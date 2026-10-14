import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store } from './store.mjs';
import { newWorkout, clone } from './domain.mjs';
import { supabase } from './client.mjs';
const memory=new Map();
globalThis.localStorage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)};
Object.defineProperty(globalThis,'navigator',{value:{onLine:true},configurable:true});
test('guardar offline y recuperar sin cambiar el ID',async()=>{
 navigator.onLine=false;const s=new Store('u1');const w=newWorkout([],'Prueba');s.edit(w);
 const restored=new Store('u1');assert.equal(restored.data.records[w.id].workout.id,w.id);assert.equal(restored.data.records[w.id].dirty,true);s.dispose();restored.dispose();navigator.onLine=true;
});
test('un fallo de red reintenta la misma mutacion',async()=>{
 const s=new Store('u2');const w=newWorkout([],'Prueba');s.edit(w);const calls=[];
 supabase.rpc=async(_name,args)=>{calls.push(args);return calls.length===1?{data:null,error:{message:'Failed to fetch'}}:{data:1,error:null};};
 await s.sync();assert.equal(s.data.records[w.id].dirty,true);await s.sync();assert.equal(calls[0].p_mutation,calls[1].p_mutation);assert.equal(s.data.records[w.id].dirty,false);s.dispose();
});
test('cambios durante el envio siguen pendientes hasta su propia confirmacion',async()=>{
 const s=new Store('u3');const w=newWorkout([],'Original');s.edit(w);
 let resolve;supabase.rpc=()=>new Promise(r=>{resolve=r;});const promise=s.sync();
 s.edit({...w,name:'Editado durante el envio'});resolve({data:1,error:null});await promise;
 assert.equal(s.data.records[w.id].dirty,true);assert.equal(s.data.records[w.id].revision,1);
 supabase.rpc=async(_name,args)=>{assert.equal(args.p_expected,1);assert.equal(args.p_payload.name,'Editado durante el envio');return{data:2,error:null};};
 await s.sync();assert.equal(s.data.records[w.id].dirty,false);s.dispose();
});
test('conflicto conserva la copia local y no reintenta sobrescribir',async()=>{
 const s=new Store('u4');const w=newWorkout([],'Local');s.edit(w);let calls=0;
 supabase.rpc=async()=>{calls++;return{data:null,error:{code:'P0001',message:'REVISION_CONFLICT'}};};
 await s.sync();await s.sync();assert.equal(calls,1);assert.equal(s.data.records[w.id].workout.name,'Local');assert.equal(s.data.records[w.id].conflict,true);s.dispose();
});
test('una copia local corrupta no se sobrescribe',()=>{
 localStorage.setItem('gym-planner:v1:u5','invalid-json');const s=new Store('u5');s.edit(newWorkout([],'Prueba'));s.persist();assert.equal(s.readFailed,true);assert.equal(localStorage.getItem('gym-planner:v1:u5'),'invalid-json');s.dispose();
});
