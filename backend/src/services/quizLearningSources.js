'use strict';
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const {Op} = require('sequelize');
const {getUploadsRoot, resolveUploadsPath} = require('../config/paths');
const logger = require('../utils/logger');
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
  let skippedFiles = 0;
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
        const filePath = path.resolve(resolveUploadsPath(location));
        // Guard against path traversal: the resolved file must stay inside the
        // uploads root. An out-of-root path is a data/security error, not a
        // stale reference, so it must not be skipped silently.
        if (!filePath.startsWith(uploadRoot + path.sep)) throw Object.assign(new Error(`Invalid learning file location: ${material.title}`), {status: 422});
        if (!fs.existsSync(filePath)) {
          // The material once referenced a real upload but the file is no
          // longer present (deleted, storage cleared, or migrated). This is a
          // stale reference that must not abort the whole quiz generation —
          // drop it and continue with the remaining course content.
          skippedFiles++;
          logger.warn(`[quizLearningSources] Skipping material #${material.id} "${material.title}" (lesson #${lesson.id}) — referenced file missing on disk: ${location}`);
          continue;
        }
        const realRoot = fs.realpathSync(uploadRoot), realPath = fs.realpathSync(filePath);
        payload = {file_path: realPath};
      }
      const aiUrl = (process.env.AI_SERVICE_URL || 'http://localhost:8000').replace(/\/+$/, '');
      const response = await axios.post(`${aiUrl}/rag/prepare-source`, {...payload, instructions, source_title: material.title}, {timeout: 120000});
      if (!response.data?.text?.trim()) throw Object.assign(new Error(`Could not read learning file: ${material.title}`), {status: 422});
      parts.push(`${material.title}\n${response.data.text}`);
    }
  }
  if (skippedFiles > 0) logger.warn(`[quizLearningSources] Skipped ${skippedFiles} file-backed material(s) whose files are missing; they were excluded from the learning source.`);
  const text = parts.join('\n\n');
  if (text.length > 150000) {
    const aiUrl = (process.env.AI_SERVICE_URL || 'http://localhost:8000').replace(/\/+$/, '');
    const response = await axios.post(`${aiUrl}/rag/prepare-source`, {text, instructions, source_title: 'Course learning materials'}, {timeout: 120000});
    if (!response.data?.text?.trim()) throw Object.assign(new Error('Could not retrieve relevant course material.'), {status: 422});
    return response.data.text;
  }
  return text;
}
module.exports = {loadLearningSources};
