import { describe, expect, it } from "vitest";
import i18n from "../i18n";
import {
  TEACHER_WANG_ID,
  XIAO_MING_ID,
  getChatCharacters,
  getTeacherWang,
  getXiaoMing,
} from "./chatCharacters";

describe("chatCharacters", () => {
  const t = i18n.getFixedT("en", "chat");

  it("renders Teacher Wang with a translated description", () => {
    const teacherWang = getTeacherWang(t);
    expect(teacherWang.id).toBe(TEACHER_WANG_ID);
    expect(teacherWang.name).toBe("Teacher Wang");
    expect(teacherWang.chineseName).toBe("王老师");
    expect(teacherWang.description).toBe(
      "The native Chinese teacher who can also speak English",
    );
  });

  it("renders Xiao Ming with a translated description", () => {
    const xiaoMing = getXiaoMing(t);
    expect(xiaoMing.id).toBe(XIAO_MING_ID);
    expect(xiaoMing.description).toBe("Your native Chinese friend");
  });

  it("returns both characters, in order, via getChatCharacters", () => {
    const characters = getChatCharacters(t);
    expect(characters.map((character) => character.id)).toEqual([
      TEACHER_WANG_ID,
      XIAO_MING_ID,
    ]);
  });

  it("translates the description into French", () => {
    const tFr = i18n.getFixedT("fr", "chat");
    expect(getTeacherWang(tFr).description).toBe(
      "Le professeur de chinois natif qui parle aussi anglais",
    );
    expect(getXiaoMing(tFr).description).toBe("Votre ami chinois natif");
  });
});
