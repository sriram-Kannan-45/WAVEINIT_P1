'use strict';
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const {Op} = require('sequelize');
const {getUploadsRoot} = require('../config/paths');
const {Lesson, LessonMaterial} = require('../models');

// courseId has already passed trainer/admin authorization at the route boundary.
async function loadLearningSources({courseId, materials, lessonIds, instructions}) {
  if (materials != null && typeof materials !== 'string') throw Object.assign(new Error('Learning notes must be text.'), {status: 422});
  if (materials?.trim()) return materials.trim();
  if (lessonIds != null && (!Array.isArray(lessonIds) || lessonIds.some(id => !/^\d+$/.test(String(id))))) throw Object.assign(new Error('Select valid lesson IDs.'), {status: 422});
  if (!courseId) {
    if (lessonIds?.length) throw Object.assign(new Error('Select a course for these lessons.'), {status: 422});
    return '';
  }
  const lessons = await Lesson.findAll({where: {courseId, ...(lessonIds?.length ? {id: {[Op.in]: lessonIds}} : {})}, include: [{model: LessonMaterial, as: 'materials'}], order: [['orderIndex', 'ASC']]});
  if (lessonIds?.length && lessons.length !== new Set(lessonIds.map(String)).size) throw Object.assign(new Error('A selected lesson does not belong to this course.'), {status: 403});
  const parts = [];
  const stripHtml = value => String(value || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').trim();
  for (const lesson of lessons) {
    const text = stripHtml(lesson.content || lesson.description);
    if (text) parts.push(`${lesson.title}\n${text}`);
    for (const material of lesson.materials || []) {
      if (material.content) parts.push(`${material.title}\n${stripHtml(material.content)}`);
      if (!material.fileUrl || !['PDF', 'PPT', 'ATTACHMENT'].includes(material.materialType)) continue;
      const location = material.fileUrl;
      let payload;
      if (/^https?:\/\//i.test(location)) payload = {source_url: location};
      else {
        const uploadRoot = path.resolve(getUploadsRoot());
        const relative = location.replace(/^\/?uploads\//, '');
        const filePath = path.resolve(uploadRoot, relative);
        if (!filePath.startsWith(uploadRoot + path.sep) || !fs.existsSync(filePath)) throw Object.assign(new Error(`Learning file unavailable: ${material.title}`), {status: 422});
        const realRoot = fs.realpathSync(uploadRoot), realPath = fs.realpathSync(filePath);
        if (!realPath.startsWith(realRoot + path.sep)) throw Object.assign(new Error('Invalid learning file location.'), {status: 422});
        payload = {file_path: realPath};
      }
      const response = await axios.post(`${process.env.AI_SERVICE_URL || 'http://localhost:8000'}/rag/prepare-source`, {...payload, instructions, source_title: material.title}, {timeout: 120000});
      if (!response.data?.text?.trim()) throw Object.assign(new Error(`Could not read learning file: ${material.title}`), {status: 422});
      parts.push(`${material.title}\n${response.data.text}`);
    }
  }
  const text = parts.join('\n\n');
  if (text.length > 150000) {
    const response = await axios.post(`${process.env.AI_SERVICE_URL || 'http://localhost:8000'}/rag/prepare-source`, {text, instructions, source_title: 'Course learning materials'}, {timeout: 120000});
    if (!response.data?.text?.trim()) throw Object.assign(new Error('Could not retrieve relevant course material.'), {status: 422});
    return response.data.text;
  }
  return text;
}
module.exports = {loadLearningSources};
