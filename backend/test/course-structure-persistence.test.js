jest.mock('../src/models',()=>({sequelize:{transaction:jest.fn()},Course:{findByPk:jest.fn()},Lesson:{destroy:jest.fn(),create:jest.fn()}}));
jest.mock('../src/services/aiService',()=>({generateCourseStructure:jest.fn()}));
const {sequelize,Course,Lesson}=require('../src/models');
const ai=require('../src/services/aiService');
const controller=require('../src/controllers/trainerCourseController');
const req={user:{id:7,role:'TRAINER'},params:{courseId:2},body:{prompt:'Photosynthesis'}};
const response=()=>{const res={status:jest.fn(),json:jest.fn()};res.status.mockReturnValue(res);return res;};
beforeEach(()=>{
 jest.clearAllMocks();
 Course.findByPk.mockResolvedValue({id:2,trainerId:7,title:'Biology'});
 ai.generateCourseStructure.mockResolvedValue({structure:{courseTitle:'Biology',estimatedDuration:'1 Hours',modules:[{title:'Plants',duration:'1 Hours',subModules:[{title:'Energy',duration:'1 Hours',topics:[{title:'Light',duration:'1 Hours',description:'Light absorption'}]}]}]}});
});
test('course replacement deletion and every inserted level share one transaction',async()=>{
 const transaction={id:'test-transaction'};
 sequelize.transaction.mockImplementation(callback=>callback(transaction));Lesson.create.mockResolvedValue({id:1});
 const res=response();await controller.generateCourseStructure(req,res);
 expect(Lesson.destroy).toHaveBeenCalledWith({where:{courseId:2},transaction});
 expect(Lesson.create).toHaveBeenCalledTimes(3);
 expect(Lesson.create.mock.calls.every(([,options])=>options.transaction===transaction)).toBe(true);
 expect(res.json).toHaveBeenCalledWith(expect.objectContaining({success:true,savedCount:3}));
});
test('a failed insert rejects the transaction and does not report successful saving',async()=>{
 let transactionRejected=false;
 sequelize.transaction.mockImplementation(async callback=>{try{return await callback({id:'test'});}catch(error){transactionRejected=true;throw error;}});
 Lesson.create.mockRejectedValue(new Error('Injected insert failure'));
 const res=response();await controller.generateCourseStructure(req,res);
 expect(transactionRejected).toBe(true);expect(res.status).toHaveBeenCalledWith(500);
 expect(res.json).not.toHaveBeenCalledWith(expect.objectContaining({success:true}));
});
