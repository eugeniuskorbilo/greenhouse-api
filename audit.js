const express=require('express');const db=require('./db');const {requireRole}=require('./auth/middleware');const router=express.Router();
router.get('/',requireRole('agronomist'),(req,res)=>res.json(db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT 100').all().map(x=>({...x,old_value:JSON.parse(x.old_value),new_value:JSON.parse(x.new_value)}))));module.exports=router;
