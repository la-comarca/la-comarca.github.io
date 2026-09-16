import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {backofficeHTML} from '../scripts/backoffice.mjs';

test('Catecismo v2 mobile shell exposes task-first navigation',()=>{
 const html=backofficeHTML('/','test');
 for(const label of ['Hoy','Calendario','Grupos','Alumnos','Más'])assert.match(html,new RegExp('>'+label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'<'));
 assert.match(html,/bo-bottom-nav/);
 assert.match(html,/data-mobile-title/);
 assert.doesNotMatch(html,/Pase de lista<\/small>/);
});

test('Catecismo v2 migration includes SIS, LMS and private document primitives',async()=>{
 const sql=await readFile(new URL('../supabase/migrations/0003_catechism_learning_platform.sql',import.meta.url),'utf8');
 for(const table of ['catechism_people','catechism_catechists','catechism_students','catechism_groups','catechism_enrollments','catechism_curriculum_topics','catechism_sessions','catechism_attendance','catechism_student_topic_progress','catechism_resources','catechism_grade_categories','catechism_assignments','catechism_submissions','catechism_questions','catechism_quizzes','catechism_quiz_attempts','catechism_student_documents'])assert.match(sql,new RegExp(`create table public\\.${table}\\b`));
 assert.match(sql,/catechism-private/);
 assert.match(sql,/public=false/);
 assert.match(sql,/catechism_can_access_group/);
});
