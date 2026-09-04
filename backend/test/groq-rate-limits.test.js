jest.mock('groq-sdk',()=>jest.fn());
const Groq=require('groq-sdk');
const {groqContent,retryDelayMs}=require('../src/services/groqProvider');
const completion={id:'test-response',model:'test-model',choices:[{finish_reason:'stop',message:{content:'{"ok":true}'}}]};
let oldKey;
beforeEach(()=>{jest.useFakeTimers();oldKey=process.env.GROQ_API_KEY;process.env.GROQ_API_KEY='unit-test-key';});
afterEach(()=>{jest.useRealTimers();if(oldKey===undefined)delete process.env.GROQ_API_KEY;else process.env.GROQ_API_KEY=oldKey;});
test.each([27,42])('honors a %i-second reset and retries the exact same request',async seconds=>{
 const create=jest.fn().mockRejectedValueOnce({status:429,headers:{'retry-after':String(seconds)}}).mockResolvedValue(completion);
 Groq.mockImplementation(()=>({chat:{completions:{create}}}));
 const pending=groqContent({prompt:'Generate only remaining quiz slots',json:true,timeout:90000,maxOutputTokens:1700});
 await jest.advanceTimersByTimeAsync(seconds*1000);
 expect(create).toHaveBeenCalledTimes(1);
 await jest.advanceTimersByTimeAsync(250);
 expect((await pending).provider).toBe('groq');
 expect(create).toHaveBeenCalledTimes(2);
 expect(create.mock.calls[1][0]).toBe(create.mock.calls[0][0]);
 expect(create.mock.calls[1][1].timeout).toBeLessThan(90000);
});
test('a daily quota reset beyond the deadline fails without sleeping or fabricating content',async()=>{
 const error={status:429,headers:{'retry-after':'3600'}};
 const create=jest.fn().mockRejectedValue(error);Groq.mockImplementation(()=>({chat:{completions:{create}}}));
 await expect(groqContent({prompt:'Quiz',timeout:90000})).rejects.toBe(error);
 expect(create).toHaveBeenCalledTimes(1);expect(jest.getTimerCount()).toBe(0);
});
test('mentor deadline still prevents a long rate-limit wait',async()=>{
 const error={status:429,headers:{'retry-after':'42'}};
 const create=jest.fn().mockRejectedValue(error);Groq.mockImplementation(()=>({chat:{completions:{create}}}));
 await expect(groqContent({prompt:'Hint',feature:'mentor',timeout:18000})).rejects.toBe(error);
 expect(create).toHaveBeenCalledTimes(1);
});
test('invalid retry headers do not cause an immediate retry loop',()=>{
 expect(retryDelayMs({headers:{'retry-after':'not-a-date'}})).toBeNull();
});
