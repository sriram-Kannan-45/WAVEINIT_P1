jest.mock('../src/services/mentorProvider',()=>({requestMentorText:jest.fn(),reviewMentorText:jest.fn()}));
const {requestMentorText,reviewMentorText}=require('../src/services/mentorProvider');
const quiz=require('../src/services/quizAiAssistantService');
const coding=require('../src/services/codingAiAssistantService');
beforeEach(()=>{jest.resetAllMocks();reviewMentorText.mockResolvedValue(true);});
const context={questionText:'Which unit measures elapsed time?',questionType:'MCQ',options:['Seconds','Metres','Kilograms','Litres'],answerStrings:['Seconds'],question:'Help me understand the concept'};
test('quiz answer leak triggers live regeneration, never a canned reply',async()=>{
 requestMentorText.mockResolvedValueOnce({text:'The answer is A: Seconds.',provider:'gemini'}).mockResolvedValueOnce({text:'Think about whether the quantity describes a duration, a length, or an amount of material. What does the question ask you to measure?',provider:'groq'});
 const result=await quiz.callQuizAssist(context);
 expect(result.tier).toBe('groq');expect(result.text).not.toContain('Seconds');expect(requestMentorText).toHaveBeenCalledTimes(2);
});
test('quiz keys and coding reference solutions never appear in outgoing prompts',async()=>{
 requestMentorText.mockResolvedValue({text:'Describe the input and what you need to discover about it. Which property matters?',provider:'groq'});
 await quiz.callQuizAssist({...context,answerStrings:['PRIVATE_KEY_SENTINEL']});
 await coding.callAssist({title:'Inspect string',problemStatement:'Check the order of characters.',language:'python',code:'text = input()',question:'Hint?',referenceSolutions:['PRIVATE_SOLUTION_SENTINEL']});
 const prompts=requestMentorText.mock.calls.map(call=>call[0]).join('\n');
 expect(prompts).not.toMatch(/PRIVATE_KEY_SENTINEL|PRIVATE_SOLUTION_SENTINEL/);expect(prompts).toContain('text = input()');
});
test('both-provider failure propagates for both chatbots',async()=>{
 requestMentorText.mockRejectedValue(Object.assign(new Error('Both providers unavailable'),{code:'AI_PROVIDERS_UNAVAILABLE',status:503}));
 await expect(quiz.callQuizAssist(context)).rejects.toMatchObject({code:'AI_PROVIDERS_UNAVAILABLE'});
 await expect(coding.callAssist({title:'Task',language:'python'})).rejects.toMatchObject({code:'AI_PROVIDERS_UNAVAILABLE'});
});
test('repeated unsafe responses return an error instead of a solution',async()=>{
 requestMentorText.mockResolvedValue({text:'The answer is A: Seconds.',provider:'groq'});
 await expect(quiz.callQuizAssist(context)).rejects.toMatchObject({code:'AI_GUIDANCE_REJECTED'});
 expect(requestMentorText).toHaveBeenCalledTimes(2);
});
test('semantic review rejects a complete algorithm in prose and regenerates a hint',async()=>{
 requestMentorText.mockResolvedValueOnce({text:'Read the string, reverse it, compare the two strings and print the result of the comparison.',provider:'groq'}).mockResolvedValueOnce({text:'Which pairs of characters would help you recognize symmetry?',provider:'groq'});
 reviewMentorText.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
 const result=await coding.callAssist({title:'Palindrome',problemStatement:'Decide whether a string is a palindrome.',language:'python',question:'Hint?'});
 expect(result.text).toContain('symmetry');expect(requestMentorText).toHaveBeenCalledTimes(2);expect(reviewMentorText).toHaveBeenCalledTimes(2);
});
