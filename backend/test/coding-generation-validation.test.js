jest.mock('../src/services/codeExecutionService',()=>({runTests:jest.fn()}));
const {runTests}=require('../src/services/codeExecutionService');
const {normalizeProblems}=require('../src/services/codingGenerationValidation');
const problem=()=>({title:'Echo',description:'Echo input',inputFormat:'One line',outputFormat:'Same line',explanation:'Output the given line',difficulty:'EASY',languageSolutions:{python:{starterCode:'value=input()',referenceSolution:'print(input())'}},testCases:[{input:'a',expectedOutput:'a',isHidden:false},{input:'b',expectedOutput:'b',isHidden:true},{input:'c',expectedOutput:'c',isHidden:true}]});
test('a wrong reference output is rejected without rewriting expected answers',async()=>{
 const p=problem();runTests.mockResolvedValue([{passed:false,actualOutput:'WRONG'},{passed:true},{passed:true}]);
 await expect(normalizeProblems([p],['python'],'Echo','EASY')).rejects.toMatchObject({code:'CODING_VALIDATION_FAILED'});
 expect(p.testCases[0].expectedOutput).toBe('a');
});
test('validation requires all requested language solutions and passing tests',async()=>{
 runTests.mockResolvedValue([{passed:true},{passed:true},{passed:true}]);
 await expect(normalizeProblems([problem()],['python','java'],'Echo','EASY')).rejects.toMatchObject({code:'CODING_VALIDATION_FAILED'});
 const result=await normalizeProblems([problem()],['python'],'Echo','EASY');
 expect(result.allPassed).toBe(true);
});
