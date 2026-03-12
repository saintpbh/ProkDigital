import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Vote, VoteOption, VoteRecord, VoteStatus, VoteType } from './vote.entity';
import { Event } from './event.entity';
import { SseService } from '../sse/sse.service';

@Injectable()
export class VotesService {
    constructor(
        @InjectRepository(Vote)
        private readonly voteRepository: Repository<Vote>,
        @InjectRepository(VoteOption)
        private readonly optionRepository: Repository<VoteOption>,
        @InjectRepository(VoteRecord)
        private readonly recordRepository: Repository<VoteRecord>,
        @InjectRepository(Event)
        private readonly eventRepository: Repository<Event>,
        private readonly sseService: SseService,
    ) { }

    async createVote(eventId: number, question: string, type: VoteType, options: string[]) {
        const event = await this.eventRepository.findOne({ where: { id: eventId } });
        if (!event) throw new NotFoundException('Event not found');

        const vote = new Vote();
        vote.question = question;
        vote.type = type;
        vote.event = event;
        vote.status = VoteStatus.WAITING;

        const savedVote = await this.voteRepository.save(vote);

        if (type === VoteType.YN) {
            options = ['찬성', '반대', '기권'];
        }

        const optionEntities = options.map(text => {
            const opt = new VoteOption();
            opt.text = text;
            opt.vote = savedVote;
            return opt;
        });

        await this.optionRepository.save(optionEntities);
        return this.getVoteDetails(savedVote.id);
    }

    async getVoteDetails(id: number) {
        return this.voteRepository.findOne({
            where: { id },
            relations: ['options', 'records', 'records.option']
        });
    }

    async findAllByEvent(eventId: number) {
        return this.voteRepository.find({
            where: { event: { id: eventId } },
            relations: ['options'],
            order: { created_at: 'DESC' }
        });
    }
    async setStatus(id: number, status: VoteStatus) {
        const voteWithRepo = await this.voteRepository.findOne({ where: { id }, relations: ['event', 'options'] });
        if (!voteWithRepo) throw new NotFoundException('Vote not found');

        voteWithRepo.status = status;
        const updated = await this.voteRepository.save(voteWithRepo);

        // SSE Broadcast
        this.sseService.sendEvent({
            event: 'vote_status_changed',
            data: {
                id: updated.id,
                status: updated.status,
                token: voteWithRepo.event.token,
                question: updated.question,
                type: updated.type,
                options: voteWithRepo.options // Use pre-loaded options
            }
        });

        return updated;
    }

    async setShowResults(id: number, show: boolean) {
        const vote = await this.voteRepository.findOne({ where: { id }, relations: ['event', 'options', 'records', 'records.option'] });
        if (!vote) throw new NotFoundException('Vote not found');

        vote.show_results = show;
        const updated = await this.voteRepository.save(vote);

        if (show) {
            const results = this.calculateResults(updated);
            this.sseService.sendEvent({
                event: 'vote_results_published',
                data: {
                    id: updated.id,
                    results,
                    token: vote.event.token
                }
            });
        }

        return updated;
    }

    async castVote(voteId: number, optionId: number, voterInfo: { ip?: string, token?: string }) {
        const vote = await this.voteRepository.findOne({ where: { id: voteId }, relations: ['event'] });
        if (!vote || vote.status !== VoteStatus.OPEN) throw new BadRequestException('투표가 진행 중이 아닙니다.');

        const option = await this.optionRepository.findOne({ where: { id: optionId } });
        if (!option) throw new NotFoundException('선택지를 찾을 수 없습니다.');

        // Simple duplicate check if token is provided
        if (voterInfo.token) {
            const existing = await this.recordRepository.findOne({
                where: { vote: { id: voteId }, voterToken: voterInfo.token }
            });
            if (existing) throw new ConflictException('이미 투표하셨습니다.');
        }

        const record = new VoteRecord();
        record.vote = vote;
        record.option = option;
        record.voterIp = voterInfo.ip || null;
        record.voterToken = voterInfo.token || null;
        await this.recordRepository.save(record);

        // Broadcast current count
        const count = await this.recordRepository.count({ where: { vote: { id: voteId } } });
        this.sseService.sendEvent({
            event: 'vote_cast_count',
            data: {
                id: voteId,
                count,
                token: vote.event.token
            }
        });

        return { success: true };
    }

    async deleteVote(id: number) {
        const vote = await this.voteRepository.findOne({ where: { id } });
        if (!vote) throw new NotFoundException();
        return this.voteRepository.remove(vote);
    }

    private calculateResults(vote: Vote) {
        const total = vote.records.length;
        const counts = vote.options.map(opt => {
            const voteCount = vote.records.filter(r => r.option.id === opt.id).length;
            return {
                optionId: opt.id,
                text: opt.text,
                count: voteCount,
                percent: total > 0 ? Math.round((voteCount / total) * 100) : 0
            };
        });
        return { total, counts };
    }
}
