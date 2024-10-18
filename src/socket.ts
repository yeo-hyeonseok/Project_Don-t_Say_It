import http from "http";
import shortid from "shortid";
import { Server, Socket } from "socket.io";
import { getRandomWord } from "./data/words";
import { getRandomTopic } from "./data/topics";

function setWebSocket(server: http.Server) {
  const io = new Server(server);

  function getRandomIndex(length: number) {
    return Math.floor(Math.random() * length);
  }

  function getPublicRooms() {
    const {
      sockets: {
        adapter: { sids, rooms },
      },
    } = io;

    return Array.from(rooms).filter((room) => !sids.get(room[0]));
  }

  io.on("connection", (socket: Socket) => {
    console.log("소켓 연결됨:", socket.id);

    let roomName: string;
    let time = 120;
    let timeInterval: NodeJS.Timeout | undefined;
    const myWord: string = getRandomWord();
    const otherWord: string = getRandomWord();

    socket.on("enter_room", () => {
      const filtered = Array.from(getPublicRooms()).filter(
        (room) => room[1].size < 2
      );

      if (filtered.length > 0) {
        // 빈 방 있으면 참여
        roomName = filtered[getRandomIndex(filtered.length)][0];

        socket.join(roomName);
        io.to(roomName).emit("send_welcome", roomName, getRandomTopic());
        socket.emit("send_myword", myWord);
        socket.to(roomName).emit("send_otherword", otherWord);
      } else {
        // 빈 방 없으면 방 생성
        roomName = shortid.generate();

        socket.join(roomName);
      }
    });

    socket.on("start_timer", () => {
      timeInterval = setInterval(() => {
        if (time > 0) {
          time--;

          socket.emit("time_change", time);
        } else {
          clearInterval(timeInterval);

          io.to(roomName).emit("time_over");
        }
      }, 1000);
    });

    socket.on("adjust_time", (amount: number, done: () => void) => {
      if (time === 120) return;

      if (amount > 0 ? time <= 100 : time >= 20) {
        time += amount;

        io.to(roomName).emit("adjust_time", time);
        io.to(roomName).emit(
          "send_notice",
          socket.id,
          amount > 0 ? "시간을 연장했습니다." : "시간을 단축했습니다."
        );
        done();
      }
    });

    socket.on("sync_time", (currentTime) => {
      time = currentTime;
    });

    socket.on("send_message", (msg: string, done: () => void) => {
      if (time === 120) return;

      socket.to(roomName).emit("send_message", msg);
      done();
    });

    socket.on("exit_room", () => {
      const room = io.sockets.adapter.rooms.get(roomName);

      if (room?.size === 2) {
        socket.to(roomName).emit("send_notice", socket.id, "나갔습니다.");
        socket.to(roomName).emit("opponent_left");
      }

      clearInterval(timeInterval);
      socket.leave(roomName);
    });

    socket.on("disconnect", () => {
      console.log("소켓 연결 해제됨");
    });
  });
}

export default setWebSocket;
