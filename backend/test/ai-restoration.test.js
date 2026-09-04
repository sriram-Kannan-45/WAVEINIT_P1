jest.mock('../src/services/aiProvider',()=>({generateContent:jest.fn()}));
const {generateContent}=require('../src/services/aiProvider');
const ai=require('../src/services/aiService');
const packet=value=>({provider:'groq',data:{candidates:[{content:{parts:[{text:JSON.stringify(value)}]}}]}});
const structure={courseTitle:'Photosynthesis',estimatedDuration:'2 hours',modules:[{title:'Plant energy',duration:'2 hours',description:'Energy in plants',subModules:[{title:'Light reactions',duration:'2 hours',topics:[{title:'Chlorophyll',duration:'2 hours',description:'Light absorption'}]}]}]};
beforeEach(()=>jest.resetAllMocks());
test('course request and source reach live generation and independent review',async()=>{
 generateContent.mockResolvedValueOnce(packet(structure)).mockResolvedValueOnce(packet({valid:true,reason:''}));
 const result=await ai.generateCourseStructure({prompt:'Teach photosynthesis for two hours',text:'Today we studied chlorophyll and light absorption in plant cells.'});
 expect(result.structure.courseTitle).toBe(structure.courseTitle);expect(result.structure.estimatedDuration).toBe('2 Hours');expect(result.generationSource).toBe('ai-verified');
 expect(generateContent.mock.calls[0][0].prompt).toContain('Today we studied chlorophyll');
 expect(generateContent).toHaveBeenCalledTimes(2);
});
test('course provider failure never returns a static curriculum',async()=>{
 generateContent.mockRejectedValue(Object.assign(new Error('Both providers failed'),{code:'AI_PROVIDERS_UNAVAILABLE'}));
 await expect(ai.generateCourseStructure({prompt:'Ancient history'})).rejects.toMatchObject({code:'AI_PROVIDERS_UNAVAILABLE'});
});
test('rejected curriculum is regenerated using review feedback',async()=>{
 generateContent.mockResolvedValueOnce(packet(structure)).mockResolvedValueOnce(packet({valid:false,reason:'Wrong schedule'})).mockResolvedValueOnce(packet(structure)).mockResolvedValueOnce(packet({valid:true,reason:''}));
 await ai.generateCourseStructure({prompt:'Photosynthesis'});
 expect(generateContent.mock.calls[2][0].prompt).toContain('Wrong schedule');
});
test('coding authoring uses shared provider and existing executable-answer validation',async()=>{
 generateContent.mockResolvedValue(packet({problems:[{title:'Count vowels',description:'Count vowels in a word'}]}));
 const normalize=jest.spyOn(ai,'_normalizeAIProblems').mockResolvedValue({problems:[{title:'Count vowels'}]});
 try {
  await ai.generateCodingProblemsFromPrompt('Count vowels in Python',1,'EASY',['python']);
  expect(generateContent.mock.calls[0][0]).toMatchObject({feature:'coding_generation',json:true});
  expect(normalize).toHaveBeenCalledTimes(1);
 } finally {normalize.mockRestore();}
});
test('language generation needs both starter and reference code',async()=>{
 generateContent.mockResolvedValue(packet({starterCode:'input()',referenceSolution:''}));
 await expect(ai.generateLanguageCode('python',{title:'Count vowels'})).rejects.toMatchObject({code:'AI_INVALID_RESPONSE'});
});
test('assessment evaluation fails instead of fabricating a keyword score',async()=>{
 generateContent.mockRejectedValue(Object.assign(new Error('Providers unavailable'),{code:'AI_PROVIDERS_UNAVAILABLE'}));
 await expect(ai.evaluateShortAnswer('Define energy','Ability to do work','work')).rejects.toMatchObject({code:'AI_PROVIDERS_UNAVAILABLE'});
});
