import { Message } from "../src/entity/task.ts";
import { Database } from "../src/services/database/database.ts";

async function test_database() {
    const db = await Database.init();
    // const user = {
    //     id: crypto.randomUUID(),
    //     subscribed: true,
    // }

    // await db.store(user); 
    const users = await db.getAllSubscribedUsers();  
    console.log(users);

    for (const user of users) {
        await db.delete(user.id);
    }

    // const test = await db.getById(users[0].id);
    // // console.log(test);

    // // test message daily work
    // const message: Message = {
    //     id: crypto.randomUUID(),
    //     userId: test ? test.id : '',
    //     content: "hoan thanh: b4: sua loi tro ly ai, chua hoan thanh: b4: integration, du dinh: B5: squirrel_v10",
    //     date: new Date()
    // }

    // await db.storeDailyWorkMessage(message);
    // if (test) {
    //     const dailywork = await db.getDailyWork(test.id, new Date());
    //     console.log(dailywork);
    // }
}   

test_database()